import { createContext, useContext } from "react";
export interface ToastInput {
  tone?: "success" | "danger" | "info";
  message: string;
}
export const ToastContext = createContext<{
  show: (toast: ToastInput) => void;
}>({ show: () => {} });
export const useToast = () => useContext(ToastContext);
