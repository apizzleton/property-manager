export const THEME_STORAGE_KEY = "pmapp-theme-color";
export const DEFAULT_THEME_HEX = "#0d9488";

export const THEME_PRESETS = [
  { label: "Teal (Default)", value: "#0d9488" },
  { label: "Blue", value: "#2563eb" },
  { label: "Indigo", value: "#4f46e5" },
  { label: "Violet", value: "#7c3aed" },
  { label: "Rose", value: "#e11d48" },
  { label: "Orange", value: "#ea580c" },
  { label: "Emerald", value: "#059669" },
] as const;

type Rgb = { r: number; g: number; b: number };

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function normalizeHex(raw: string): string {
  const value = raw.trim();
  const hex = value.startsWith("#") ? value.slice(1) : value;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    const expanded = hex.split("").map((c) => `${c}${c}`).join("");
    return `#${expanded.toLowerCase()}`;
  }
  return DEFAULT_THEME_HEX;
}

function hexToRgb(hex: string): Rgb {
  const clean = normalizeHex(hex).slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(rgb: Rgb): string {
  const toHex = (c: number) => clampChannel(c).toString(16).padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

function mix(hexA: string, hexB: string, weight: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex({
    r: a.r + (b.r - a.r) * weight,
    g: a.g + (b.g - a.g) * weight,
    b: a.b + (b.b - a.b) * weight,
  });
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((v) => v / 255).map((v) => (
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

function pickReadableText(bg: string): string {
  const white = "#ffffff";
  const slate = "#0f172a";
  return contrastRatio(white, bg) >= contrastRatio(slate, bg) ? white : slate;
}

export function buildThemePalette(baseHex: string) {
  const primary = normalizeHex(baseHex);
  return {
    primary,
    primaryForeground: pickReadableText(primary),
    ring: primary,
    secondary: mix(primary, "#ffffff", 0.86),
    secondaryForeground: mix(primary, "#0f172a", 0.72),
    accent: mix(primary, "#ffffff", 0.78),
    accentForeground: mix(primary, "#0f172a", 0.68),
    muted: mix(primary, "#ffffff", 0.84),
  };
}

export function applyThemeColor(baseHex: string) {
  if (typeof document === "undefined") return;

  const palette = buildThemePalette(baseHex);
  const root = document.documentElement;
  root.style.setProperty("--primary", palette.primary);
  root.style.setProperty("--primary-foreground", palette.primaryForeground);
  root.style.setProperty("--ring", palette.ring);
  root.style.setProperty("--secondary", palette.secondary);
  root.style.setProperty("--secondary-foreground", palette.secondaryForeground);
  root.style.setProperty("--accent", palette.accent);
  root.style.setProperty("--accent-foreground", palette.accentForeground);
  root.style.setProperty("--muted", palette.muted);
}

export function readSavedThemeColor() {
  if (typeof window === "undefined") return DEFAULT_THEME_HEX;
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  return raw ? normalizeHex(raw) : DEFAULT_THEME_HEX;
}

export function saveThemeColor(baseHex: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizeHex(baseHex);
  window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
  applyThemeColor(normalized);
  window.dispatchEvent(new CustomEvent("pmapp-theme-changed", { detail: normalized }));
}
