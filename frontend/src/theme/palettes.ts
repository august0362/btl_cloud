// Colours are defined in themes.css from the reference images in this folder.
// Cold/DarkCold and Winter/DarkWinter form light/dark pairs; Cold is duplicated.
export const palettes = [
  { id: "cold", name: "Xanh lạnh" },
  { id: "winter", name: "Đông rêu" },
  { id: "summer", name: "Hè dịu" },
  { id: "fall", name: "Thu ấm" },
  { id: "cyan", name: "Neon Cyan" },
  { id: "violet", name: "Neon Violet" },
  { id: "gold", name: "Neon Gold" },
  { id: "ocean", name: "Biển ngọc" },
  { id: "grape", name: "Nho tím" },
  { id: "forest", name: "Rừng xanh" },
  { id: "rose", name: "Hồng mận" },
  { id: "coffee", name: "Nâu cà phê" },
  { id: "blossom", name: "Hồng sương" },
  { id: "lavender", name: "Lavender" },
  { id: "fresh", name: "Vườn mùa xuân" },
  { id: "peach", name: "Đào kem" },
  { id: "sakura", name: "Sakura" },
  { id: "ice", name: "Mây xanh" },
  { id: "honey", name: "Mật ong" },
] as const;

export type PaletteId = (typeof palettes)[number]["id"];
export type ThemeMode = "light" | "dark" | "system";
export interface ThemePreferences {
  palette: PaletteId;
  mode: ThemeMode;
}

export const THEME_STORAGE_KEY = "btl-cloud-appearance";
export const defaultPreferences: ThemePreferences = {
  palette: "cold",
  mode: "system",
};

export function readThemePreferences(): ThemePreferences {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(THEME_STORAGE_KEY) ?? "null",
    );
    if (value && typeof value === "object") {
      const { palette, mode } = value as Record<string, unknown>;
      if (
        palettes.some((item) => item.id === palette) &&
        (mode === "light" || mode === "dark" || mode === "system")
      ) {
        return { palette: palette as PaletteId, mode };
      }
    }
  } catch {
    // Appearance remains usable when storage is disabled or contains stale data.
  }
  return defaultPreferences;
}

export function systemPrefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function applyTheme(preferences: ThemePreferences, systemDark: boolean) {
  const dark =
    preferences.mode === "system" ? systemDark : preferences.mode === "dark";
  document.documentElement.dataset.theme = preferences.palette;
  document.documentElement.dataset.colorScheme = dark ? "dark" : "light";
}
