import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceState } from "../data/types";
import { validateWorkspace } from "../data/validateWorkspace";

const SETTINGS_KEY = "workhour-studio.webdav-sync.v1";
const SYNC_FORMAT = "workhour-studio.webdav-sync";
const SYNC_VERSION = 1;
const BACKUP_FORMAT = "workhour-studio.workspace";
const DEFAULT_FILE_NAME = "workhour-studio.sync.json";
const DEFAULT_SYNC_FOLDER = "workhour-studio";

type SyncableWorkspace = Omit<WorkspaceState, "jobs">;

type WebDavRemoteFile =
  | { status: "found"; content: string; etag?: string | null }
  | { status: "notFound" };

type WebDavSyncDocument = {
  format: typeof SYNC_FORMAT;
  version: number;
  updatedAt: string;
  data: SyncableWorkspace;
};

export type WebDavConfig = {
  endpoint: string;
  syncFolder: string;
  username: string;
  fileName: string;
};

export type WebDavSyncSettings = WebDavConfig & {
  lastSyncedFingerprint?: string;
  lastSyncedAt?: string;
};

export type WebDavSyncResult =
  | { kind: "uploaded" | "upToDate"; settings: WebDavSyncSettings; message: string }
  | { kind: "downloaded"; settings: WebDavSyncSettings; workspace: WorkspaceState; message: string }
  | { kind: "resolve"; reason: "firstSync" | "conflict"; remoteUpdatedAt?: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const storage = () => (typeof window === "undefined" ? null : window.localStorage);

export const isTauriRuntime = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function normalizeWebDavConfig(config: Partial<WebDavConfig>): WebDavConfig {
  return {
    endpoint: String(config.endpoint || "").trim(),
    // Keep an older saved endpoint working as the final folder address. New
    // configurations start with a dedicated folder instead.
    syncFolder: typeof config.syncFolder === "string"
      ? config.syncFolder.trim()
      : config.endpoint ? "" : DEFAULT_SYNC_FOLDER,
    username: String(config.username || "").trim(),
    fileName: String(config.fileName || DEFAULT_FILE_NAME).trim() || DEFAULT_FILE_NAME,
  };
}

export function validateWebDavConfig(config: WebDavConfig) {
  const normalized = normalizeWebDavConfig(config);
  if (!normalized.endpoint) return "请填写 WebDAV 文件夹地址。";
  if (!normalized.username) return "请填写 WebDAV 用户名。";
  if (
    normalized.syncFolder
    && (normalized.syncFolder === "."
      || normalized.syncFolder === ".."
      || /[\\/?#%]/.test(normalized.syncFolder))
  ) return "同步文件夹不能包含路径或 URL 特殊字符。";
  if (
    normalized.fileName === "."
    || normalized.fileName === ".."
    || /[\\/?#%]/.test(normalized.fileName)
  ) return "同步文件名不能包含路径或 URL 特殊字符。";
  try {
    const url = new URL(normalized.endpoint);
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return "WebDAV 地址必须是有效的 HTTP 或 HTTPS 地址。";
    if (url.username || url.password) return "请不要把账号或密码写进 WebDAV 地址，请使用独立字段。";
    if (url.search || url.hash) return "WebDAV 地址不能包含查询参数或锚点。";
  } catch {
    return "WebDAV 地址格式不正确。";
  }
  return "";
}

export function isSameWebDavConfig(left: WebDavConfig, right: WebDavConfig) {
  const a = normalizeWebDavConfig(left);
  const b = normalizeWebDavConfig(right);
  return a.endpoint === b.endpoint
    && a.syncFolder === b.syncFolder
    && a.username === b.username
    && a.fileName === b.fileName;
}

export function hasWebDavConnection(settings: WebDavConfig) {
  return !validateWebDavConfig(settings);
}

export function readWebDavSettings(): WebDavSyncSettings {
  try {
    const raw = storage()?.getItem(SETTINGS_KEY);
    if (!raw) return normalizeWebDavConfig({});
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return normalizeWebDavConfig({});
    const config = normalizeWebDavConfig(parsed as Partial<WebDavConfig>);
    return {
      ...config,
      lastSyncedFingerprint: typeof parsed.lastSyncedFingerprint === "string" ? parsed.lastSyncedFingerprint : undefined,
      lastSyncedAt: typeof parsed.lastSyncedAt === "string" ? parsed.lastSyncedAt : undefined,
    };
  } catch {
    return normalizeWebDavConfig({});
  }
}

function writeWebDavSettings(settings: WebDavSyncSettings) {
  const normalized = normalizeWebDavConfig(settings);
  const safeSettings: WebDavSyncSettings = {
    ...normalized,
    lastSyncedFingerprint: settings.lastSyncedFingerprint,
    lastSyncedAt: settings.lastSyncedAt,
  };
  storage()?.setItem(SETTINGS_KEY, JSON.stringify(safeSettings));
  return safeSettings;
}

export function persistWebDavSyncSettings(settings: WebDavSyncSettings) {
  return writeWebDavSettings(settings);
}

export function saveWebDavConnection(config: WebDavConfig) {
  const previous = readWebDavSettings();
  const normalized = normalizeWebDavConfig(config);
  return writeWebDavSettings({
    ...normalized,
    ...(isSameWebDavConfig(previous, normalized)
      ? {
          lastSyncedFingerprint: previous.lastSyncedFingerprint,
          lastSyncedAt: previous.lastSyncedAt,
        }
      : {}),
  });
}

export async function testAndStoreWebDavConnection(config: WebDavConfig, password: string) {
  const normalized = normalizeWebDavConfig(config);
  const validationError = validateWebDavConfig(normalized);
  if (validationError) throw new Error(validationError);
  if (!password) throw new Error("请填写 WebDAV 密码或应用专用密码。");
  if (!isTauriRuntime()) throw new Error("请在桌面应用中配置 WebDAV 同步。");

  await invoke("test_webdav_connection", { request: { config: normalized, password } });
  await invoke("store_webdav_password", { request: { password } });
  return saveWebDavConnection(normalized);
}

export async function disconnectWebDav() {
  if (isTauriRuntime()) await invoke("delete_webdav_password");
  storage()?.removeItem(SETTINGS_KEY);
}

function sortById<T extends { id: string }>(items: T[]) {
  return [...items].sort((left, right) => left.id.localeCompare(right.id));
}

function syncableWorkspace(state: WorkspaceState): SyncableWorkspace {
  const { excelPath: _excelPath, ...profile } = state.profile;
  return {
    profile,
    projects: sortById(state.projects),
    aliases: sortById(state.aliases),
    templates: sortById(state.templates),
    monthlyTemplateSettings: sortById(state.monthlyTemplateSettings || []),
    templatePresets: sortById(state.templatePresets || []),
    blocks: sortById(state.blocks),
    entries: sortById(state.entries),
  };
}

function isSyncableWorkspace(value: unknown): value is SyncableWorkspace {
  if (!isRecord(value) || !isRecord(value.profile)) return false;
  return ["projects", "aliases", "templates", "monthlyTemplateSettings", "templatePresets", "blocks", "entries"]
    .every((key) => Array.isArray(value[key]));
}

function createDocument(state: WorkspaceState): WebDavSyncDocument {
  return {
    format: SYNC_FORMAT,
    version: SYNC_VERSION,
    updatedAt: new Date().toISOString(),
    data: syncableWorkspace(state),
  };
}

function parseDocument(content: string): WebDavSyncDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error("云端同步文件不是有效 JSON。请确认没有选择其他文件。");
  }
  if (!isRecord(raw)) throw new Error("云端同步文件格式不正确。");

  if (raw.format === SYNC_FORMAT && Number(raw.version) === SYNC_VERSION && isSyncableWorkspace(raw.data)) {
    return {
      format: SYNC_FORMAT,
      version: SYNC_VERSION,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
      data: syncableWorkspace(validateWorkspace({ ...raw.data, jobs: [] })),
    };
  }

  if (raw.format === BACKUP_FORMAT && raw.version === 1 && isRecord(raw.data)) {
    return {
      format: SYNC_FORMAT,
      version: SYNC_VERSION,
      updatedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
      data: syncableWorkspace(validateWorkspace(raw.data)),
    };
  }

  throw new Error("云端同步文件不是 Workhour Studio 数据，请确认同步文件名和路径。");
}

function applyRemoteDocument(document: WebDavSyncDocument, current: WorkspaceState): WorkspaceState {
  return {
    ...document.data,
    profile: {
      ...document.data.profile,
      excelPath: current.profile.excelPath,
    },
    jobs: current.jobs,
  };
}

async function fingerprint(data: SyncableWorkspace) {
  const source = JSON.stringify(data);
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  }

  let value = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    value ^= source.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return `fnv-${(value >>> 0).toString(16)}`;
}

async function getRemoteFile(config: WebDavConfig) {
  return invoke<WebDavRemoteFile>("webdav_get_file", { config: normalizeWebDavConfig(config) });
}

async function uploadDocument(state: WorkspaceState, settings: WebDavSyncSettings, remote: Extract<WebDavRemoteFile, { status: "found" }> | null) {
  const document = createDocument(state);
  const dataFingerprint = await fingerprint(document.data);
  await invoke("webdav_put_file", {
    request: {
      config: normalizeWebDavConfig(settings),
      content: JSON.stringify(document),
      expectedEtag: remote?.etag || null,
      onlyIfMissing: !remote,
    },
  });
  const nextSettings: WebDavSyncSettings = {
    ...normalizeWebDavConfig(settings),
    lastSyncedFingerprint: dataFingerprint,
    lastSyncedAt: new Date().toISOString(),
  };
  return {
    kind: "uploaded" as const,
    settings: nextSettings,
    message: remote ? "本机数据已安全上传到云端。" : "已创建云端同步文件并上传本机数据。",
  };
}

async function downloadDocument(state: WorkspaceState, settings: WebDavSyncSettings, remote: Extract<WebDavRemoteFile, { status: "found" }>) {
  const document = parseDocument(remote.content);
  const dataFingerprint = await fingerprint(document.data);
  const nextSettings: WebDavSyncSettings = {
    ...normalizeWebDavConfig(settings),
    lastSyncedFingerprint: dataFingerprint,
    lastSyncedAt: new Date().toISOString(),
  };
  return {
    kind: "downloaded" as const,
    settings: nextSettings,
    workspace: applyRemoteDocument(document, state),
    message: "已下载并应用云端数据。",
  };
}

export async function syncWebDavWorkspace(state: WorkspaceState, settings: WebDavSyncSettings): Promise<WebDavSyncResult> {
  const validationError = validateWebDavConfig(settings);
  if (validationError) throw new Error(validationError);
  if (!isTauriRuntime()) throw new Error("请在桌面应用中使用 WebDAV 同步。");

  const remote = await getRemoteFile(settings);
  if (remote.status === "notFound") return uploadDocument(state, settings, null);

  const document = parseDocument(remote.content);
  const [localFingerprint, remoteFingerprint] = await Promise.all([
    fingerprint(syncableWorkspace(state)),
    fingerprint(document.data),
  ]);
  const baseline = settings.lastSyncedFingerprint;

  if (localFingerprint === remoteFingerprint) {
    const nextSettings: WebDavSyncSettings = {
      ...normalizeWebDavConfig(settings),
      lastSyncedFingerprint: localFingerprint,
      lastSyncedAt: new Date().toISOString(),
    };
    return { kind: "upToDate", settings: nextSettings, message: "本机和云端数据已经一致。" };
  }

  if (!baseline) {
    return { kind: "resolve", reason: "firstSync", remoteUpdatedAt: document.updatedAt || undefined };
  }

  const localChanged = localFingerprint !== baseline;
  const remoteChanged = remoteFingerprint !== baseline;
  if (localChanged && remoteChanged) {
    return { kind: "resolve", reason: "conflict", remoteUpdatedAt: document.updatedAt || undefined };
  }
  if (localChanged) return uploadDocument(state, settings, remote);
  if (remoteChanged) return downloadDocument(state, settings, remote);

  const nextSettings: WebDavSyncSettings = {
    ...normalizeWebDavConfig(settings),
    lastSyncedFingerprint: remoteFingerprint,
    lastSyncedAt: new Date().toISOString(),
  };
  return { kind: "upToDate", settings: nextSettings, message: "本机和云端数据已经一致。" };
}

export async function resolveWebDavSync(
  state: WorkspaceState,
  settings: WebDavSyncSettings,
  resolution: "upload" | "download",
): Promise<Exclude<WebDavSyncResult, { kind: "resolve" }>> {
  const remote = await getRemoteFile(settings);
  if (resolution === "download") {
    if (remote.status === "notFound") throw new Error("云端同步文件不存在，无法下载。");
    return downloadDocument(state, settings, remote);
  }
  return uploadDocument(state, settings, remote.status === "found" ? remote : null);
}
