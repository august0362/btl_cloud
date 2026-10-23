import { createContext, useContext } from "react";
import type { PaletteId, ThemeMode, ThemePreferences } from "./palettes";

export const ThemeContext = createContext<
  | (ThemePreferences & {
      setPalette: (palette: PaletteId) => void;
      setMode: (mode: ThemeMode) => void;
    })
  | null
>(null);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("ThemeProvider is required");
  return context;
}
