import { ApiError } from "../api/errors";
import type { FormErrors } from "./validation";

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: "Email hoặc mật khẩu không đúng.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
  CSRF_REJECTED: "Yêu cầu bị từ chối vì lý do bảo mật. Vui lòng tải lại trang.",
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  DOCUMENT_NOT_FOUND: "Không tìm thấy tài liệu hoặc bạn không có quyền xem.",
  STORAGE_UNAVAILABLE:
    "Kho lưu trữ tệp tạm thời không khả dụng. Vui lòng thử lại sau.",
  NETWORK_ERROR: "Không thể kết nối máy chủ. Kiểm tra mạng và thử lại.",
  ABORTED: "Đã huỷ tải lên.",
  UNAUTHENTICATED: "Bạn cần đăng nhập để thực hiện thao tác này.",
};
export function errorMessage(error: unknown) {
  if (!(error instanceof ApiError))
    return "Đã có lỗi xảy ra. Vui lòng thử lại.";
  if (messages[error.code]) return messages[error.code];
  if (
    ["VALIDATION_ERROR", "PAYLOAD_TOO_LARGE", "INVALID_JSON"].includes(
      error.code,
    )
  )
    return error.message;
  return `Đã có lỗi xảy ra. Vui lòng thử lại.${error.requestId ? ` Mã yêu cầu: ${error.requestId}` : ""}`;
}
export function fieldErrors(error: unknown): FormErrors {
  if (!(error instanceof ApiError)) return {};
  if (error.code === "EMAIL_ALREADY_EXISTS")
    return { email: "Email đã được sử dụng." };
  if (error.code === "FILE_TOO_LARGE")
    return { file: "Tệp vượt quá dung lượng tối đa 50 MB." };
  if (error.code === "UNSUPPORTED_FILE_TYPE")
    return { file: "Chỉ hỗ trợ tệp PDF, DOCX, PPTX." };
  return Object.fromEntries(
    error.details
      .filter((issue) => issue.field !== "body")
      .map((issue) => [issue.field, issue.message]),
  );
}
