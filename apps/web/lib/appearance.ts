export type AppearanceTheme = "LIGHT" | "DARK" | "SYSTEM";
export type AppearanceTextScale = "DEFAULT" | "LARGE" | "XL";
export type AppearanceContrast = "NORMAL" | "HIGH";
export type AppearanceFontWeight = "NORMAL" | "BOLD";
export type AppearanceNavDensity = "COMPACT" | "COMFORTABLE";
export type AppearanceMotion = "FULL" | "REDUCED";
export type AppearanceFocusRing = "STANDARD" | "STRONG";
export type AppearanceColorPreset = "DEFAULT" | "SLATE" | "TEAL";

export type AppearanceSettings = {
  theme: AppearanceTheme;
  textScale: AppearanceTextScale;
  contrast: AppearanceContrast;
  fontWeight: AppearanceFontWeight;
  navDensity: AppearanceNavDensity;
  motion: AppearanceMotion;
  focusRing: AppearanceFocusRing;
  colorPreset: AppearanceColorPreset;
};

export const APPEARANCE_STORAGE_KEY = "haulio:appearance";
export const APPEARANCE_EVENT_NAME = "haulio:appearance-updated";

export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: "SYSTEM",
  textScale: "DEFAULT",
  contrast: "NORMAL",
  fontWeight: "NORMAL",
  navDensity: "COMFORTABLE",
  motion: "FULL",
  focusRing: "STANDARD",
  colorPreset: "DEFAULT",
};

const enumLists = {
  theme: ["LIGHT", "DARK", "SYSTEM"],
  textScale: ["DEFAULT", "LARGE", "XL"],
  contrast: ["NORMAL", "HIGH"],
  fontWeight: ["NORMAL", "BOLD"],
  navDensity: ["COMPACT", "COMFORTABLE"],
  motion: ["FULL", "REDUCED"],
  focusRing: ["STANDARD", "STRONG"],
  colorPreset: ["DEFAULT", "SLATE", "TEAL"],
} as const;

function toLowerToken(value: string) {
  return value.toLowerCase();
}

function getResolvedTheme(theme: AppearanceTheme): "LIGHT" | "DARK" {
  if (theme === "LIGHT" || theme === "DARK") return theme;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "DARK";
  }
  return "LIGHT";
}

export function normalizeAppearance(input: unknown): AppearanceSettings {
  const value = (input && typeof input === "object" ? (input as Record<string, unknown>) : {}) ?? {};
  const safe = <K extends keyof AppearanceSettings>(key: K): AppearanceSettings[K] => {
    const raw = value[key];
    if (typeof raw !== "string") return DEFAULT_APPEARANCE[key];
    const normalized = raw.toUpperCase();
    return (enumLists[key] as readonly string[]).includes(normalized)
      ? (normalized as AppearanceSettings[K])
      : DEFAULT_APPEARANCE[key];
  };
  return {
    theme: safe("theme"),
    textScale: safe("textScale"),
    contrast: safe("contrast"),
    fontWeight: safe("fontWeight"),
    navDensity: safe("navDensity"),
    motion: safe("motion"),
    focusRing: safe("focusRing"),
    colorPreset: safe("colorPreset"),
  };
}

export function applyAppearanceToDocument(settings: AppearanceSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = toLowerToken(settings.theme);
  root.dataset.themeResolved = toLowerToken(getResolvedTheme(settings.theme));
  root.dataset.textScale = toLowerToken(settings.textScale);
  root.dataset.contrast = toLowerToken(settings.contrast);
  root.dataset.fontWeight = toLowerToken(settings.fontWeight);
  root.dataset.navDensity = toLowerToken(settings.navDensity);
  root.dataset.motion = toLowerToken(settings.motion);
  root.dataset.focusRing = toLowerToken(settings.focusRing);
  root.dataset.colorPreset = toLowerToken(settings.colorPreset);
}

export function readAppearanceLocal(): AppearanceSettings {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
  if (!raw) return DEFAULT_APPEARANCE;
  try {
    return normalizeAppearance(JSON.parse(raw));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function persistAppearanceLocal(settings: AppearanceSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
}

export function broadcastAppearance(settings: AppearanceSettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT_NAME, { detail: settings }));
}
