import { getVersion } from "@tauri-apps/api/app";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Field, Input } from "../components/ui/Form";
import { PageHeader } from "../components/ui/PageHeader";
import type { WorkspaceState } from "../data/types";
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

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function SettingsPage({ state, save }: SettingsPageProps) {
  const [profile, setProfile] = useState(state.profile);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [manualStatus, setManualStatus] = useState<ManualUpdateStatus>("idle");
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(readAutoUpdateEnabled);

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

  return (
    <>
      <PageHeader
        title="设置"
        description="维护默认作息、主题、显示偏好和应用更新。"
        action={<Button variant="primary" onClick={() => void save({ profile: { ...profile, updatedAt: new Date().toISOString() } }, "设置已保存")}>保存设置</Button>}
      />
      <div className="grid max-w-4xl gap-5">
        <Card className="p-5">
          <CardHeader title="默认作息">用于日程生成和月度目标工时计算。</CardHeader>
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
      </div>
    </>
  );
}
