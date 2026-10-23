/** Mã lỗi và envelope theo ARCHITECTURE §A7.2–§A7.3. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'CSRF_REJECTED'
  | 'FORBIDDEN'
  | 'ROUTE_NOT_FOUND'
  | 'DOCUMENT_NOT_FOUND'
  | 'EMAIL_ALREADY_EXISTS'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'STORAGE_UNAVAILABLE'
  | 'SERVICE_UNAVAILABLE';

export type IssueCode =
  | 'REQUIRED'
  | 'INVALID_TYPE'
  | 'INVALID_FORMAT'
  | 'TOO_SHORT'
  | 'TOO_LONG'
  | 'OUT_OF_RANGE'
  | 'INVALID_ENUM'
  | 'UNKNOWN_FIELD'
  | 'EMPTY_FILE'
  | 'TOO_MANY_FILES'
  | 'NO_CHANGES'
  | 'UNAVAILABLE';

export interface ValidationIssue {
  field: string;
  issue: IssueCode;
  message: string;
}

export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_JSON: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  CSRF_REJECTED: 403,
  FORBIDDEN: 403,
  ROUTE_NOT_FOUND: 404,
  DOCUMENT_NOT_FOUND: 404,
  EMAIL_ALREADY_EXISTS: 409,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  FILE_TOO_LARGE: 413,
  UNSUPPORTED_FILE_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  STORAGE_UNAVAILABLE: 503,
  SERVICE_UNAVAILABLE: 503,
};

export const ERROR_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Dữ liệu gửi lên không hợp lệ.',
  INVALID_JSON: 'Dữ liệu JSON không hợp lệ.',
  UNAUTHENTICATED: 'Bạn cần đăng nhập để thực hiện thao tác này.',
  INVALID_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  CSRF_REJECTED: 'Yêu cầu bị từ chối vì lý do bảo mật.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  ROUTE_NOT_FOUND: 'Không tìm thấy đường dẫn API.',
  DOCUMENT_NOT_FOUND: 'Không tìm thấy tài liệu.',
  EMAIL_ALREADY_EXISTS: 'Email đã được sử dụng.',
  CONFLICT: 'Tài liệu vừa được thay đổi bởi thao tác khác. Vui lòng tải lại trang và thử lại.',
  PAYLOAD_TOO_LARGE: 'Dữ liệu gửi lên quá lớn.',
  FILE_TOO_LARGE: 'Tệp vượt quá dung lượng tối đa 50 MB.',
  UNSUPPORTED_FILE_TYPE: 'Chỉ hỗ trợ tệp PDF, DOCX, PPTX.',
  RATE_LIMITED: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.',
  INTERNAL_ERROR: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
  STORAGE_UNAVAILABLE: 'Kho lưu trữ tệp tạm thời không khả dụng. Vui lòng thử lại sau.',
  SERVICE_UNAVAILABLE: 'Dịch vụ chưa sẵn sàng.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ValidationIssue[];
  readonly headers: Record<string, string>;

  constructor(
    code: ErrorCode,
    options: { message?: string; details?: ValidationIssue[]; headers?: Record<string, string>; cause?: unknown } = {},
  ) {
    super(options.message ?? ERROR_MESSAGE[code], { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    this.details = options.details ?? [];
    this.headers = options.headers ?? {};
  }
}

export function validationError(details: ValidationIssue[]): AppError {
  return new AppError('VALIDATION_ERROR', { details });
}
