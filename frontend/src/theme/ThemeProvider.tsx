import {
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ThemeContext } from "./context";
import {
  applyTheme,
  readThemePreferences,
  systemPrefersDark,
  THEME_STORAGE_KEY,
  type ThemePreferences,
} from "./palettes";

function subscribeToColorScheme(onChange: () => void) {
  const query = window.matchMedia?.("(prefers-color-scheme: dark)");
  query?.addEventListener("change", onChange);
  return () => query?.removeEventListener("change", onChange);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readThemePreferences);
  const systemDark = useSyncExternalStore(
    subscribeToColorScheme,
    systemPrefersDark,
    () => false,
  );

  useLayoutEffect(() => {
    applyTheme(preferences, systemDark);
  }, [preferences, systemDark]);

  const update = (next: ThemePreferences) => {
    setPreferences(next);
    try {
      // Only visual preferences are stored here; session cookies stay with the API.
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A blocked/full store must not prevent changing the current appearance.
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        ...preferences,
        setPalette: (palette) => update({ ...preferences, palette }),
        setMode: (mode) => update({ ...preferences, mode }),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
