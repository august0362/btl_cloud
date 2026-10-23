import { request } from "./client";
import type { LoginInput, MeData, RegisterInput, UserData } from "./types";

export const authApi = {
  me: (signal?: AbortSignal) =>
    request<MeData>("GET", "/api/auth/me", { signal }),
  register: (body: RegisterInput) =>
    request<UserData>("POST", "/api/auth/register", { body }),
  login: (body: LoginInput) =>
    request<UserData>("POST", "/api/auth/login", { body }),
  logout: () => request<void>("POST", "/api/auth/logout"),
};
