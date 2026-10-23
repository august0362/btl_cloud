import { useRef, useState } from "react";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/errors";
import type { DocumentDto } from "../api/types";
import { errorMessage } from "../lib/errorMessages";
import { useToast } from "./useToast";

export function useDeleteDocument(onDeleted: () => void) {
  const [target, setTarget] = useState<DocumentDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const { show } = useToast();
  const confirm = async () => {
    if (!target || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await documentsApi.remove(target.id);
      setTarget(null);
      show({ tone: "success", message: "Đã xoá tài liệu" });
      onDeleted();
    } catch (failure) {
      if (
        failure instanceof ApiError &&
        failure.code === "DOCUMENT_NOT_FOUND"
      ) {
        setTarget(null);
        show({ tone: "info", message: "Tài liệu không còn tồn tại." });
        onDeleted();
      } else {
        setError(errorMessage(failure));
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return {
    target,
    busy,
    error,
    confirm,
    open: (item: DocumentDto) => {
      setError("");
      setTarget(item);
    },
    cancel: () => {
      if (!lock.current) {
        setTarget(null);
        setError("");
      }
    },
  };
}
