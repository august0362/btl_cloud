import { Navigate, Outlet, useLocation } from "react-router";
import { Spinner } from "../components/ui";
import { useAuth } from "./context";

export function RequireAuth() {
  const { user, status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Spinner label="Đang khôi phục phiên…" />;
  return user ? (
    <Outlet />
  ) : (
    <Navigate
      replace
      to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
    />
  );
}
export function GuestOnly() {
  const { user, status } = useAuth();
  if (status === "loading") return <Spinner label="Đang khôi phục phiên…" />;
  return user ? <Navigate replace to="/me/documents" /> : <Outlet />;
}
