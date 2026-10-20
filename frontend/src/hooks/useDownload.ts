import { useLocation, useNavigate } from "react-router";
import { authApi } from "../api/auth";
import { documentsApi } from "../api/documents";
import { useAuth } from "../auth/context";
import { errorMessage } from "../lib/errorMessages";
import { useToast } from "./useToast";

export function useDownload() {
  const location = useLocation();
  const navigate = useNavigate();
  const { markSignedOut } = useAuth();
  const { show } = useToast();
  return async (id: string) => {
    try {
      const data = await authApi.me();
      if (!data.user) {
        markSignedOut();
        navigate(
          `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`,
        );
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = documentsApi.downloadUrl(id);
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch (error) {
      show({ tone: "danger", message: errorMessage(error) });
    }
  };
}
