import { ApiError, notifyUnauthorized, responseError } from "./errors";

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
}
export async function request<T>(
  method: string,
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method))
    headers["X-CSRF-Protection"] = "1";
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      signal: options.signal,
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch (error) {
    if (
      options.signal?.aborted ||
      (error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "AbortError")
    ) {
      throw new ApiError(0, "ABORTED", "Đã huỷ yêu cầu.");
    }
    throw new ApiError(
      0,
      "NETWORK_ERROR",
      "Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.",
    );
  }
  if (response.status === 204) return undefined as T;
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok)
    throw notifyUnauthorized(
      responseError(
        response.status,
        payload,
        response.headers.get("X-Request-Id") ?? "",
      ),
    );
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new ApiError(
      response.status,
      "INTERNAL_ERROR",
      "Phản hồi máy chủ không hợp lệ.",
    );
  }
  return payload.data as T;
}

export function queryString(params: object) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      query.set(key, String(value));
  });
  return query.size ? `?${query}` : "";
}
