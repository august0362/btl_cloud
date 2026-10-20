import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import {
  applyTheme,
  readThemePreferences,
  systemPrefersDark,
} from "./theme/palettes";
import "./styles/tokens.css";
import "./styles/global.css";
import "./theme/themes.css";

applyTheme(readThemePreferences(), systemPrefersDark());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
