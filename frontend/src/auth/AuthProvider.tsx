import {
  startTransition,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { authApi } from "../api/auth";
import { ApiError } from "../api/errors";
import type { LoginInput, RegisterInput, UserDto } from "../api/types";
import { useToast } from "../hooks/useToast";
import { AuthContext } from "./context";
import { safeRedirect } from "../lib/safeRedirect";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const { show } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const markSignedOut = useCallback(() => {
    setUser(null);
    setStatus("ready");
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    authApi
      .me(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setUser(data.user);
          setStatus("ready");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          markSignedOut();
          if (!(error instanceof ApiError && error.code === "ABORTED"))
            show({
              tone: "danger",
              message:
                "Không thể khôi phục phiên. Kiểm tra kết nối và thử lại.",
            });
        }
      });
    return () => controller.abort();
  }, [show, markSignedOut]);
  useEffect(() => {
    const expired = () => {
      markSignedOut();
      show({
        tone: "info",
        message: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
      });
    };
    window.addEventListener("auth:unauthorized", expired);
    return () => window.removeEventListener("auth:unauthorized", expired);
  }, [markSignedOut, show]);
  const authenticated = (value: UserDto) => {
    // Update identity and route together so guards cannot override the form destination.
    startTransition(() => {
      setUser(value);
      setStatus("ready");
      navigate(
        safeRedirect(new URLSearchParams(location.search).get("redirect")),
        { replace: true },
      );
    });
  };
  const login = async (input: LoginInput) => {
    const data = await authApi.login(input);
    authenticated(data.user);
  };
  const register = async (input: RegisterInput) => {
    const data = await authApi.register(input);
    authenticated(data.user);
  };
  const logout = async () => {
    try {
      await authApi.logout();
      show({ tone: "success", message: "Đã đăng xuất" });
    } catch {
      show({
        tone: "danger",
        message:
          "Đã thoát giao diện. Không thể xác nhận đăng xuất với máy chủ.",
      });
    } finally {
      startTransition(() => {
        markSignedOut();
        navigate("/");
      });
    }
  };
  const refresh = async () => {
    const data = await authApi.me();
    setUser(data.user);
    setStatus("ready");
  };
  return (
    <AuthContext.Provider
      value={{ user, status, login, register, logout, refresh, markSignedOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}
