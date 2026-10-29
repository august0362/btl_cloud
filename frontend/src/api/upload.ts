import { ApiError, notifyUnauthorized, responseError } from "./errors";
import { backendUnavailable, reportConnectionFailure, reportConnectionSuccess } from "./serviceStatus";

export interface UploadOptions {
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}
export function uploadMultipart<T>(
  method: "POST" | "PUT",
  path: string,
  formData: FormData,
  options: UploadOptions = {},
): Promise<T> {
  if (backendUnavailable())
    return Promise.reject(new ApiError(0, "NETWORK_ERROR", "Máy chủ đang ngoại tuyến. Tệp đã chọn vẫn được giữ."));
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const abort = () => xhr.abort();
    const finish = (value?: T, error?: ApiError) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(notifyUnauthorized(error));
      else resolve(value as T);
    };
    if (options.signal?.aborted) {
      finish(undefined, new ApiError(0, "ABORTED", "Đã huỷ tải lên."));
      return;
    }
    xhr.open(method, path);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("X-CSRF-Protection", "1");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        options.onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 500) reportConnectionFailure();
      else reportConnectionSuccess();
      let payload: unknown;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(
          undefined,
          responseError(
            xhr.status,
            payload,
            xhr.getResponseHeader("X-Request-Id") ?? "",
          ),
        );
      } else if (payload && typeof payload === "object" && "data" in payload) {
        finish(payload.data as T);
      } else {
        finish(
          undefined,
          new ApiError(
            xhr.status,
            "INTERNAL_ERROR",
            "Phản hồi máy chủ không hợp lệ.",
          ),
        );
      }
    };
    xhr.onerror = () => {
      reportConnectionFailure();
      finish(
        undefined,
        new ApiError(
          0,
          "NETWORK_ERROR",
          "Kết nối bị gián đoạn. Vui lòng thử lại.",
        ),
      );
    };
    xhr.onabort = () =>
      finish(undefined, new ApiError(0, "ABORTED", "Đã huỷ tải lên."));
    options.signal?.addEventListener("abort", abort, { once: true });
    xhr.send(formData);
  });
}
