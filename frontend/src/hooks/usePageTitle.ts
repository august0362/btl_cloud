import { useEffect } from "react";
import { APP_NAME } from "../lib/constants";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
    const frame = requestAnimationFrame(() => {
      // A delayed route focus must not interrupt typing or an open dialog.
      if (
        document.querySelector("dialog[open]") ||
        document.activeElement?.matches("input, textarea, select, button")
      ) return;
      document.querySelector<HTMLElement>("main h1")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [title]);
}
