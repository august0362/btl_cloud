import { useEffect } from "react";
import { APP_NAME } from "../lib/constants";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLElement>("main h1")?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [title]);
}
