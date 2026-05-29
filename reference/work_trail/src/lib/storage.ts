import type { AppState, ThemePreference } from '../types';

const STORAGE_KEY = 'chrono-canvas-mvp-state-v1';
const THEME_STORAGE_KEY = 'chrono-canvas-mvp-theme-v1';

export function loadState() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AppState;
  } catch {
    return null;
  }
}

export function saveState(state: AppState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function loadThemePreference(): ThemePreference {
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
}

export function saveThemePreference(themePreference: ThemePreference) {
  window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);
}
