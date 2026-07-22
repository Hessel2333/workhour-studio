import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import { Check, Download, RefreshCw, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import {
  autoUpdatePreferenceEvent,
  dispatchUpdateCheckResult,
  readAutoUpdateEnabled,
  requestUpdateCheckEvent,
} from "./updateEvents";

const INITIAL_CHECK_DELAY_MS = 3000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 30000;
const COMPLETED_UPDATE_STORAGE_KEY = "workhour-studio.completed-update";
const LAST_SEEN_VERSION_STORAGE_KEY = "workhour-studio.last-seen-version";

type UpdateStatus = "available" | "downloading" | "ready" | "error";

type CompletedUpdate = {
  fromVersion: string;
  toVersion: string;
  body?: string;
  date?: string;
};

const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function normalizeNotes(body?: string) {
  const lines = (body || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const listItems = lines
    .filter((line) => /^[-*]\s+/.test(line))
    .map((line) => line.replace(/^[-*]\s+/, ""));
  const notes = listItems.length
    ? listItems
    : lines.filter((line) => !/^#{1,6}\s+/.test(line));

  return notes.length ? notes.slice(0, 10) : ["本次更新包含功能改进与稳定性优化。"];
}

function readCompletedUpdate() {
  try {
    const raw = window.localStorage.getItem(COMPLETED_UPDATE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as CompletedUpdate : null;
  } catch {
    window.localStorage.removeItem(COMPLETED_UPDATE_STORAGE_KEY);
    return null;
  }
}

function rememberInstalledUpdate(update: Update, currentVersion: string) {
  window.localStorage.setItem(COMPLETED_UPDATE_STORAGE_KEY, JSON.stringify({
    fromVersion: currentVersion,
    toVersion: update.version,
    body: update.body,
    date: update.date,
  } satisfies CompletedUpdate));
}

export function AppUpdateManager() {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<UpdateStatus>("available");
  const [update, setUpdate] = useState<Update | null>(null);
  const [completedUpdate, setCompletedUpdate] = useState<CompletedUpdate | null>(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [contentLength, setContentLength] = useState(0);
  const [autoEnabled, setAutoEnabled] = useState(readAutoUpdateEnabled);
  const checkingRef = useRef(false);

  const checkForUpdates = useCallback(async (manual = false) => {
    if (!isTauriRuntime()) {
      if (manual) dispatchUpdateCheckResult({ status: "error" });
      return;
    }
    if (checkingRef.current) {
      if (manual) dispatchUpdateCheckResult({ status: "checking" });
      return;
    }

    checkingRef.current = true;
    if (manual) dispatchUpdateCheckResult({ status: "checking" });
    try {
      const [foundUpdate, localVersion] = await Promise.all([
        check({ timeout: UPDATE_TIMEOUT_MS }),
        getVersion(),
      ]);
      setCurrentVersion(localVersion);
      if (!foundUpdate) {
        if (manual) dispatchUpdateCheckResult({ status: "latest" });
        return;
      }
      setUpdate(foundUpdate);
      setStatus("available");
      setDownloadedBytes(0);
      setContentLength(0);
      setVisible(true);
      if (manual) dispatchUpdateCheckResult({ status: "available", version: foundUpdate.version });
    } catch (error) {
      console.warn("Update check failed", error);
      if (manual) dispatchUpdateCheckResult({ status: "error" });
    } finally {
      checkingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    void getVersion().then((version) => {
      const completed = readCompletedUpdate();
      if (completed?.toVersion === version) {
        setCompletedUpdate(completed);
        setVisible(true);
      } else {
        window.localStorage.removeItem(COMPLETED_UPDATE_STORAGE_KEY);
        const previousVersion = window.localStorage.getItem(LAST_SEEN_VERSION_STORAGE_KEY);
        if (previousVersion && previousVersion !== version) {
          setCompletedUpdate({ fromVersion: previousVersion, toVersion: version });
          setVisible(true);
        }
      }
      window.localStorage.setItem(LAST_SEEN_VERSION_STORAGE_KEY, version);
      setCurrentVersion(version);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const handlePreference = (event: Event) => setAutoEnabled((event as CustomEvent<boolean>).detail);
    window.addEventListener(autoUpdatePreferenceEvent, handlePreference);
    return () => window.removeEventListener(autoUpdatePreferenceEvent, handlePreference);
  }, []);

  useEffect(() => {
    if (!autoEnabled) return;
    const initialTimer = window.setTimeout(() => void checkForUpdates(false), INITIAL_CHECK_DELAY_MS);
    const interval = window.setInterval(() => void checkForUpdates(false), UPDATE_CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(interval);
    };
  }, [autoEnabled, checkForUpdates]);

  useEffect(() => {
    const handleManualCheck = () => void checkForUpdates(true);
    window.addEventListener(requestUpdateCheckEvent, handleManualCheck);
    return () => window.removeEventListener(requestUpdateCheckEvent, handleManualCheck);
  }, [checkForUpdates]);

  const installUpdate = async () => {
    if (!update || status === "downloading") return;
    setStatus("downloading");
    let received = 0;
    let total = 0;
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          total = event.data.contentLength || 0;
          setContentLength(total);
          setDownloadedBytes(0);
        } else if (event.event === "Progress") {
          received += event.data.chunkLength;
          setDownloadedBytes(received);
        } else if (event.event === "Finished") {
          setDownloadedBytes(total || received);
        }
      });
      rememberInstalledUpdate(update, currentVersion || update.currentVersion);
      setStatus("ready");
    } catch (error) {
      console.warn("Update install failed", error);
      setStatus("error");
    }
  };

  const closeCompleted = () => {
    window.localStorage.removeItem(COMPLETED_UPDATE_STORAGE_KEY);
    setCompletedUpdate(null);
    setVisible(false);
  };

  if (!visible || (!update && !completedUpdate)) return null;

  const targetVersion = completedUpdate?.toVersion || update?.version || "";
  const percent = contentLength ? Math.min(100, Math.round(downloadedBytes / contentLength * 100)) : 0;
  const isCompleted = Boolean(completedUpdate);
  const isDownloading = status === "downloading";

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/25 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
      <div className="panel-card w-full max-w-lg overflow-hidden rounded-[28px] bg-white/95 dark:bg-slate-900/95">
        <div className="flex items-start gap-4 border-b border-line/10 p-6">
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent">
            {isCompleted ? <Check className="size-5" /> : <Sparkles className="size-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="update-dialog-title" className="text-lg font-semibold">{isCompleted ? "更新成功" : "发现新版本"}</h2>
            <p className="mt-1 text-sm text-muted">
              {isCompleted
                ? `Workhour Studio 已从 v${completedUpdate?.fromVersion} 更新到 v${targetVersion}`
                : `当前 v${currentVersion || update?.currentVersion}，可更新到 v${targetVersion}`}
            </p>
          </div>
          <button className="grid size-9 place-items-center rounded-full text-muted hover:bg-black/5 dark:hover:bg-white/10" type="button" aria-label="关闭" disabled={isDownloading} onClick={isCompleted ? closeCompleted : () => setVisible(false)}>
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          {!isCompleted ? (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                <div className={`h-full rounded-full bg-accent transition-[width] ${isDownloading && !contentLength ? "w-1/3 animate-pulse" : ""}`} style={contentLength ? { width: `${percent}%` } : undefined} />
              </div>
              <p className="mt-2 text-xs text-muted">
                {status === "downloading" ? `正在下载${contentLength ? ` · ${percent}%` : ""}` : status === "ready" ? "更新已安装，重启后生效。" : status === "error" ? "更新失败，请重试。" : "准备好后即可下载并安装。"}
              </p>
            </div>
          ) : null}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">更新内容</p>
            <ul className="mt-3 space-y-2 text-sm text-ink/80">
              {normalizeNotes(completedUpdate?.body || update?.body).map((note) => <li key={note}>• {note}</li>)}
            </ul>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-line/10 p-5">
          {isCompleted ? (
            <Button variant="primary" onClick={closeCompleted}>我知道了</Button>
          ) : status === "ready" ? (
            <><Button onClick={() => setVisible(false)}>稍后重启</Button><Button variant="primary" onClick={() => void relaunch()}><RefreshCw className="size-4" />重启应用</Button></>
          ) : (
            <><Button disabled={isDownloading} onClick={() => setVisible(false)}>稍后</Button><Button variant="primary" disabled={isDownloading} onClick={() => void installUpdate()}><Download className="size-4" />{isDownloading ? "正在下载" : status === "error" ? "重试" : "下载并安装"}</Button></>
          )}
        </div>
      </div>
    </div>
  );
}
