import { useCallback, useEffect, useState } from "react";
import { ApiError } from "../api/errors";

export function useResource<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{
    data: T | null;
    error: unknown;
    loading: boolean;
  }>({ data: null, error: null, loading: true });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setState((value) => ({ ...value, loading: true, error: null }));
    loader(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (
          !controller.signal.aborted &&
          !(error instanceof ApiError && error.code === "ABORTED")
        )
          setState((value) => ({ ...value, error, loading: false }));
      });
    return () => controller.abort();
  }, [loader, version]);
  return { ...state, reload };
}
