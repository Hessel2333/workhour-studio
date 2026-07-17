export const requestUpdateCheckEvent = "workhour-studio:request-update-check";
export const updateCheckResultEvent = "workhour-studio:update-check-result";
export const autoUpdatePreferenceEvent = "workhour-studio:auto-update-preference";

const AUTO_UPDATE_STORAGE_KEY = "workhour-studio.auto-update-enabled";

export type UpdateCheckResult = {
  status: "checking" | "latest" | "available" | "error";
  version?: string;
};

export function requestUpdateCheck() {
  window.dispatchEvent(new Event(requestUpdateCheckEvent));
}

export function dispatchUpdateCheckResult(result: UpdateCheckResult) {
  window.dispatchEvent(new CustomEvent<UpdateCheckResult>(updateCheckResultEvent, { detail: result }));
}

export function readAutoUpdateEnabled() {
  return window.localStorage.getItem(AUTO_UPDATE_STORAGE_KEY) !== "false";
}

export function saveAutoUpdateEnabled(enabled: boolean) {
  window.localStorage.setItem(AUTO_UPDATE_STORAGE_KEY, String(enabled));
  window.dispatchEvent(new CustomEvent<boolean>(autoUpdatePreferenceEvent, { detail: enabled }));
}
