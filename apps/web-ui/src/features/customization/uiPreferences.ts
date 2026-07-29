export const THEMES = ['dark', 'light', 'high-contrast', 'cyberpunk', 'forest'] as const;
export const BUTTON_STYLES = ['rounded', 'sharp', 'pill'] as const;
export const COLOR_SCHEMES = ['blue', 'purple', 'green', 'red', 'orange'] as const;

export type Theme = (typeof THEMES)[number];
export type ButtonStyle = (typeof BUTTON_STYLES)[number];
export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export interface UiPreferences {
  theme: Theme;
  buttonStyle: ButtonStyle;
  colorScheme: ColorScheme;
  accentOpacity: number;
  borderRadius: number;
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  theme: 'dark',
  buttonStyle: 'rounded',
  colorScheme: 'blue',
  accentOpacity: 100,
  borderRadius: 8,
};

const STORAGE_KEYS = {
  theme: 'app-theme',
  buttonStyle: 'button-style',
  colorScheme: 'color-scheme',
  accentOpacity: 'accent-opacity',
  borderRadius: 'border-radius',
} as const;

function readChoice<T extends string>(
  storage: Storage,
  key: string,
  choices: readonly T[],
  fallback: T,
): T {
  const value = storage.getItem(key);
  return value && choices.includes(value as T) ? value as T : fallback;
}

function readNumber(
  storage: Storage,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

export function loadUiPreferences(storage: Storage = window.localStorage): UiPreferences {
  try {
    return {
      theme: readChoice(storage, STORAGE_KEYS.theme, THEMES, DEFAULT_UI_PREFERENCES.theme),
      buttonStyle: readChoice(
        storage,
        STORAGE_KEYS.buttonStyle,
        BUTTON_STYLES,
        DEFAULT_UI_PREFERENCES.buttonStyle,
      ),
      colorScheme: readChoice(
        storage,
        STORAGE_KEYS.colorScheme,
        COLOR_SCHEMES,
        DEFAULT_UI_PREFERENCES.colorScheme,
      ),
      accentOpacity: readNumber(
        storage,
        STORAGE_KEYS.accentOpacity,
        DEFAULT_UI_PREFERENCES.accentOpacity,
        10,
        100,
      ),
      borderRadius: readNumber(
        storage,
        STORAGE_KEYS.borderRadius,
        DEFAULT_UI_PREFERENCES.borderRadius,
        0,
        24,
      ),
    };
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function applyUiPreferences(
  preferences: UiPreferences,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = preferences.theme;
  root.dataset.buttonStyle = preferences.buttonStyle;
  root.dataset.colorScheme = preferences.colorScheme;
  root.dataset.customRadius = 'true';
  root.style.setProperty('--accent-opacity', String(preferences.accentOpacity / 100));
  root.style.setProperty('--accent-overlay-percent', `${preferences.accentOpacity / 10}%`);
  root.style.setProperty('--custom-radius', `${preferences.borderRadius}px`);
}

export function saveUiPreferences(
  preferences: UiPreferences,
  storage: Storage = window.localStorage,
): void {
  try {
    storage.setItem(STORAGE_KEYS.theme, preferences.theme);
    storage.setItem(STORAGE_KEYS.buttonStyle, preferences.buttonStyle);
    storage.setItem(STORAGE_KEYS.colorScheme, preferences.colorScheme);
    storage.setItem(STORAGE_KEYS.accentOpacity, String(preferences.accentOpacity));
    storage.setItem(STORAGE_KEYS.borderRadius, String(preferences.borderRadius));
  } catch {
    // Applying preferences in memory should still work when storage is unavailable.
  }
}

export function initializeUiPreferences(): UiPreferences {
  const preferences = loadUiPreferences();
  applyUiPreferences(preferences);
  return preferences;
}
