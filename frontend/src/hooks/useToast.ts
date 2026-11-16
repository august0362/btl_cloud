import { createContext, useContext, type ReactNode } from "react";
export interface ToastInput {
  tone?: "success" | "danger" | "info" | "warning";
  message: ReactNode;
  persist?: boolean;
}
export const ToastContext = createContext<{
  show: (toast: ToastInput) => void;
}>({ show: () => {} });
export const useToast = () => useContext(ToastContext);
