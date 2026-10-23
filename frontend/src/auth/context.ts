import { createContext, useContext } from "react";
import type { LoginInput, RegisterInput, UserDto } from "../api/types";

export interface AuthState {
  user: UserDto | null;
  status: "loading" | "ready";
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  markSignedOut: () => void;
}
export const AuthContext = createContext<AuthState | null>(null);
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is required");
  return value;
}
