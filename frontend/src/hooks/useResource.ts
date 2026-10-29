import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/errors";

export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>, resourceKey?: string) {
  const [state, setState] = useState<{
    data: T | null;
    error: unknown;
    loading: boolean;
    resourceKey?: string;
  }>({ data: null, error: null, loading: true, resourceKey });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setState((value) => ({ ...value, loading: true, error: null }));
    loader(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ data, error: null, loading: false, resourceKey });
      })
      .catch((error) => {
        if (
          !controller.signal.aborted &&
          !(error instanceof ApiError && error.code === "ABORTED")
        )
          setState((value) => ({ ...value, error, loading: false }));
      });
    return () => controller.abort();
  }, [loader, version, resourceKey]);
  // Retain a cached resource during an outage, but never show another document/account's cache.
  return { ...state, data: state.resourceKey === resourceKey ? state.data : null, reload };
}
