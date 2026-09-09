import { getVersion } from "@tauri-apps/api/app";
import { Cloud, Download, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Form";
import { PageHeader } from "../components/ui/PageHeader";
import type { WorkspaceState } from "../data/types";
import { validateProfile } from "../data/validateWorkspace";
import {
  disconnectWebDav,
  hasWebDavConnection,
  isSameWebDavConfig,
  isTauriRuntime as isWebDavTauriRuntime,
  normalizeWebDavConfig,
  persistWebDavSyncSettings,
  readWebDavSettings,
  resolveWebDavSync,
  syncWebDavWorkspace,
  testAndStoreWebDavConnection,
  type WebDavConfig,
  type WebDavSyncResult,
  type WebDavSyncSettings,
} from "../features/webdavSync";
import {
  readAutoUpdateEnabled,
  requestUpdateCheck,
  saveAutoUpdateEnabled,
  updateCheckResultEvent,
  type UpdateCheckResult,
} from "../features/updates/updateEvents";

type SettingsPageProps = {
  state: WorkspaceState;
  save: (patch: Partial<WorkspaceState>, message?: string) => Promise<void>;
};

type ManualUpdateStatus = "idle" | UpdateCheckResult["status"];
type WebDavBusyState = "idle" | "connecting" | "syncing" | "resolving" | "disconnecting";
type PendingSyncResolution = Extract<WebDavSyncResult, { kind: "resolve" }>;

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const formatSyncTime = (value?: string) => value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "尚未同步";
const errorMessage = (error: unknown) => String(error).replace(/^Error:\s*/, "");

export function SettingsPage({ state, save }: SettingsPageProps) {
  const [profile, setProfile] = useState(state.profile);
  const [profileError, setProfileError] = useState("");
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<ManualUpdateStatus>("idle");
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(readAutoUpdateEnabled);
  const [webdavSettings, setWebdavSettings] = useState<WebDavSyncSettings>(() => readWebDavSettings());
  const [webdavDraft, setWebdavDraft] = useState<WebDavConfig>(() => normalizeWebDavConfig(readWebDavSettings()));
  const [webdavPassword, setWebdavPassword] = useState("");
  const [webdavBusy, setWebdavBusy] = useState<WebDavBusyState>("idle");
  const [webdavStatus, setWebdavStatus] = useState("");
  const [pendingSyncResolution, setPendingSyncResolution] = useState<PendingSyncResolution | null>(null);

  useEffect(() => setProfile(state.profile), [state.profile]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void getVersion().then(setAppVersion).catch(() => setAppVersion(null));
  }, []);

  useEffect(() => {
    const handleResult = (event: Event) => setManualStatus((event as CustomEvent<UpdateCheckResult>).detail.status);
    window.addEventListener(updateCheckResultEvent, handleResult);
    return () => window.removeEventListener(updateCheckResultEvent, handleResult);
  }, []);

  const updateStatusText = manualStatus === "checking"
    ? "正在检查更新…"
    : manualStatus === "latest"
      ? "当前已经是最新版本。"
      : manualStatus === "available"
        ? "发现新版本，已打开更新窗口。"
        : manualStatus === "error"
          ? isTauriRuntime() ? "检查失败，请确认网络后重试。" : "请在桌面应用中检查更新。"
          : appVersion ? `当前版本 v${appVersion}` : "桌面应用会显示当前版本。";

  const toggleAutoUpdate = (enabled: boolean) => {
    setAutoUpdateEnabled(enabled);
    saveAutoUpdateEnabled(enabled);
  };

  const persistSyncSettings = (next: WebDavSyncSettings) => {
    const saved = persistWebDavSyncSettings(next);
    setWebdavSettings(saved);
    return saved;
  };

  const applySyncResult = async (result: Exclude<WebDavSyncResult, { kind: "resolve" }>) => {
    if (result.kind === "downloaded") await save(result.workspace, result.message);
    persistSyncSettings(result.settings);
    setPendingSyncResolution(null);
    setWebdavStatus(result.message);
  };

  const connectWebDav = async () => {
    setWebdavBusy("connecting");
    setWebdavStatus("");
    try {
      const saved = await testAndStoreWebDavConnection(webdavDraft, webdavPassword);
      setWebdavSettings(saved);
      setWebdavDraft(normalizeWebDavConfig(saved));
      setWebdavPassword("");
      setPendingSyncResolution(null);
      setWebdavStatus("WebDAV 已连接，密码已保存到系统凭据库。");
    } catch (error) {
      setWebdavStatus(errorMessage(error));
    } finally {
      setWebdavBusy("idle");
    }
  };

  const syncWebDav = async () => {
    if (!isSameWebDavConfig(webdavDraft, webdavSettings)) {
      setWebdavStatus("地址或账号已修改，请先连接并保存后再同步。");
      return;
    }
    setWebdavBusy("syncing");
    setWebdavStatus("");
    try {
      const result = await syncWebDavWorkspace(state, webdavSettings);
      if (result.kind === "resolve") {
        setPendingSyncResolution(result);
        setWebdavStatus(result.reason === "firstSync" ? "首次接入发现已有云端数据，请选择要保留的版本。" : "本机和云端都有新改动，请选择要保留的版本。");
        return;
      }
      await applySyncResult(result);
    } catch (error) {
      const message = errorMessage(error);
      if (message.startsWith("CONFLICT:")) {
        setPendingSyncResolution({ kind: "resolve", reason: "conflict" });
        setWebdavStatus("云端文件在上传前发生了变化，请选择要保留的版本。");
      } else {
        setWebdavStatus(message);
      }
    } finally {
      setWebdavBusy("idle");
    }
  };

  const resolveSync = async (resolution: "upload" | "download") => {
    setWebdavBusy("resolving");
    setWebdavStatus("");
    try {
      const result = await resolveWebDavSync(state, webdavSettings, resolution);
      await applySyncResult(result);
    } catch (error) {
      setWebdavStatus(errorMessage(error));
    } finally {
      setWebdavBusy("idle");
    }
  };

  const removeWebDavConnection = async () => {
    setWebdavBusy("disconnecting");
    try {
      await disconnectWebDav();
      const empty = normalizeWebDavConfig({});
      setWebdavSettings(empty);
      setWebdavDraft(empty);
      setWebdavPassword("");
      setPendingSyncResolution(null);
      setWebdavStatus("已断开 WebDAV；云端同步文件未被删除。");
    } catch (error) {
      setWebdavStatus(errorMessage(error));
    } finally {
      setWebdavBusy("idle");
    }
  };

  const webdavConnected = hasWebDavConnection(webdavSettings);
  const webdavAvailable = isWebDavTauriRuntime();
  const webdavWorking = webdavBusy !== "idle";

  const saveProfile = async () => {
    try {
      const next = { ...profile, updatedAt: new Date().toISOString() };
      validateProfile(next);
      await save({ profile: next }, "设置已保存");
      setProfileError("");
    } catch (error) {
      setProfileError(errorMessage(error));
    }
  };

  return (
    <>
      <PageHeader
        title="设置"
        description="维护默认作息、主题、显示偏好和应用更新。"
        action={<Button variant="primary" onClick={() => void saveProfile()}>保存设置</Button>}
      />
      <div className="grid max-w-4xl gap-5">
        <Card className="p-5">
          <CardHeader title="默认作息">用于日程生成和月度目标工时计算。</CardHeader>
          {profileError && <p className="px-5 text-sm text-red-600" role="alert">{profileError}</p>}
          <div className="grid gap-4 p-5 md:grid-cols-2">
            <Field label="默认开始"><Input type="time" value={profile.defaultStart} onChange={(event) => setProfile({ ...profile, defaultStart: event.target.value })} /></Field>
            <Field label="默认结束"><Input type="time" value={profile.defaultEnd} onChange={(event) => setProfile({ ...profile, defaultEnd: event.target.value })} /></Field>
            <Field label="午休开始"><Input type="time" value={profile.lunchStart} onChange={(event) => setProfile({ ...profile, lunchStart: event.target.value })} /></Field>
            <Field label="午休结束"><Input type="time" value={profile.lunchEnd} onChange={(event) => setProfile({ ...profile, lunchEnd: event.target.value })} /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <CardHeader title="应用更新">启动后自动检查，也可以随时手动检查新版本。</CardHeader>
          <div className="grid gap-4 p-5 pb-3 md:grid-cols-[1fr_auto] md:items-center">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line/10 bg-white/45 p-4 dark:bg-white/5">
              <input className="mt-1 size-4 accent-blue-500" type="checkbox" checked={autoUpdateEnabled} onChange={(event) => toggleAutoUpdate(event.target.checked)} />
              <span><span className="block text-sm font-semibold">自动检查更新</span><span className="mt-1 block text-xs leading-5 text-muted">应用启动 3 秒后检查，此后每 6 小时检查一次；后台检查失败不会打断工作。</span></span>
            </label>
            <Button disabled={manualStatus === "checking"} onClick={() => { setManualStatus("checking"); requestUpdateCheck(); }}>
              <RefreshCw className={`size-4 ${manualStatus === "checking" ? "animate-spin" : ""}`} />检查更新
            </Button>
          </div>
          <p className="px-5 pb-5 text-xs text-muted" aria-live="polite">{updateStatusText}</p>
        </Card>

        <Card className="p-5">
          <CardHeader title="云端同步">使用你自己的 WebDAV 文件夹，在多台设备之间同步工时、项目、模板和日程。</CardHeader>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line/10 bg-white/45 p-4 dark:bg-white/5">
              <div className="flex items-start gap-3">
                <Cloud className="mt-0.5 size-5 text-accent" />
                <div>
                  <p className="text-sm font-semibold text-ink">{webdavConnected ? "WebDAV 已配置" : "尚未配置 WebDAV"}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">密码只保存在系统凭据库，不会写入本地数据或云端同步文件。</p>
                </div>
              </div>
              <p className="text-xs text-muted">上次同步：{formatSyncTime(webdavSettings.lastSyncedAt)}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="WebDAV 地址" className="md:col-span-2">
                <Input
                  type="url"
                  autoComplete="url"
                  value={webdavDraft.endpoint}
                  placeholder="https://gima.teracloud.jp/dav/"
                  onChange={(event) => setWebdavDraft({ ...webdavDraft, endpoint: event.target.value })}
                />
              </Field>
              <Field label="同步文件夹">
                <Input
                  autoComplete="off"
                  value={webdavDraft.syncFolder}
                  placeholder="workhour-studio"
                  onChange={(event) => setWebdavDraft({ ...webdavDraft, syncFolder: event.target.value })}
                />
              </Field>
              <Field label="用户名">
                <Input autoComplete="username" value={webdavDraft.username} onChange={(event) => setWebdavDraft({ ...webdavDraft, username: event.target.value })} />
              </Field>
              <Field label="密码或应用专用密码">
                <Input type="password" autoComplete="current-password" value={webdavPassword} onChange={(event) => setWebdavPassword(event.target.value)} />
              </Field>
              <Field label="同步文件名（可保持默认）">
                <Input value={webdavDraft.fileName} onChange={(event) => setWebdavDraft({ ...webdavDraft, fileName: event.target.value })} />
              </Field>
            </div>

            <p className="text-xs leading-5 text-muted">
              首次连接会在 WebDAV 地址下创建独立的“{webdavDraft.syncFolder || "当前"}”文件夹，并在其中保存同步数据。请不要使用 Zotero 的 zotero 文件夹。
            </p>

            <div className="flex flex-wrap gap-2">
              <Button variant="primary" disabled={!webdavAvailable || webdavWorking} onClick={() => void connectWebDav()}>
                <ShieldCheck className="size-4" />{webdavBusy === "connecting" ? "正在连接" : "连接并保存"}
              </Button>
              <Button disabled={!webdavAvailable || !webdavConnected || webdavWorking} onClick={() => void syncWebDav()}>
                <RefreshCw className={`size-4 ${webdavBusy === "syncing" ? "animate-spin" : ""}`} />{webdavBusy === "syncing" ? "正在同步" : "立即同步"}
              </Button>
              {webdavConnected ? <Button variant="ghost" disabled={webdavWorking} onClick={() => void removeWebDavConnection()}>断开连接</Button> : null}
            </div>

            {!webdavAvailable ? <p className="text-xs leading-5 text-muted">请在 Workhour Studio 桌面应用中配置 WebDAV 同步。</p> : null}
            {webdavStatus ? <p className="text-sm leading-6 text-muted" aria-live="polite">{webdavStatus}</p> : null}

            {pendingSyncResolution ? (
              <div className="rounded-2xl border border-line/10 bg-white/55 p-4 dark:bg-white/5">
                <p className="text-sm font-semibold text-ink">需要确认同步版本</p>
                <p className="mt-1 text-xs leading-5 text-muted">
                  {pendingSyncResolution.reason === "firstSync"
                    ? "该位置已经有 Workhour Studio 数据。选择上传会替换云端文件；选择下载会用云端数据替换本机工时、项目、模板和日程。"
                    : "为避免静默覆盖，两端均有改动时需要由你决定保留哪个版本。"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="primary" disabled={webdavWorking} onClick={() => void resolveSync("upload")}><Upload className="size-4" />保留此设备并上传</Button>
                  <Button disabled={webdavWorking} onClick={() => void resolveSync("download")}><Download className="size-4" />使用云端版本</Button>
                </div>
              </div>
            ) : null}

            <p className="text-xs leading-5 text-muted">云端会保存可恢复的工作区数据；请只使用自己信任的 HTTPS WebDAV 服务和应用专用密码。同步不会包含本机 Excel 路径或导入导出历史。</p>
          </div>
        </Card>
      </div>
    </>
  );
}
