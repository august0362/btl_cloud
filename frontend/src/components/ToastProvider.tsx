import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ToastContext, type ToastInput } from "../hooks/useToast";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<(ToastInput & { id: number })[]>([]);
  const sequence = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const show = useCallback((toast: ToastInput) => {
    const id = ++sequence.current;
    setToasts((value) => [...value, { ...toast, id }]);
    timers.current.push(
      setTimeout(
        () => setToasts((value) => value.filter((item) => item.id !== id)),
        5000,
      ),
    );
  }, []);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="false">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`toast toast--${toast.tone ?? "info"}`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="Đóng thông báo"
              onClick={() =>
                setToasts((value) =>
                  value.filter((item) => item.id !== toast.id),
                )
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
