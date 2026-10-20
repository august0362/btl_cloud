import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/errors";
import type { UploadOptions } from "../api/upload";

export function useUploadTask() {
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  const run = useCallback(
    async <T>(operation: (options: UploadOptions) => Promise<T>) => {
      if (controller.current)
        throw new ApiError(409, "CONFLICT", "Một yêu cầu đang được xử lý.");
      const current = new AbortController();
      controller.current = current;
      setBusy(true);
      setProgress(0);
      try {
        return await operation({
          signal: current.signal,
          onProgress: (value) => {
            if (mounted.current) setProgress(value);
          },
        });
      } finally {
        controller.current = null;
        if (mounted.current) setBusy(false);
      }
    },
    [],
  );
  return { busy, progress, run, cancel: () => controller.current?.abort() };
}
