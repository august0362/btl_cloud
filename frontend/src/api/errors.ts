import type { DuplicateMatchDto } from "./duplicates";
import type { ValidationIssue } from "./types";

export class ApiError extends Error {
  readonly duplicates: DuplicateMatchDto[];
  readonly status: number;
  readonly code: string;
  readonly details: ValidationIssue[];
  readonly requestId: string;

  constructor(
    status: number,
    code: string,
    message: string,
    details: ValidationIssue[] = [],
    requestId = "",
    duplicates: DuplicateMatchDto[] = [],
  ) {
    super(message);
    this.name = "ApiError";
    this.duplicates = code === "DUPLICATE_DOCUMENT" ? duplicates : [];
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export function responseError(
  status: number,
  payload: unknown,
  requestId = "",
): ApiError {
  const body = payload as {
    error?: {
      duplicates?: DuplicateMatchDto[];
      code?: string;
      message?: string;
      details?: ValidationIssue[];
      requestId?: string;
    };
  } | null;
  const value = body?.error;
  return new ApiError(
    status,
    value?.code ?? "INTERNAL_ERROR",
    value?.message ?? "Đã có lỗi xảy ra. Vui lòng thử lại.",
    Array.isArray(value?.details) ? value.details : [],
    value?.requestId ?? requestId,
    Array.isArray(value?.duplicates) ? value.duplicates : [],
  );
}

export function notifyUnauthorized(error: ApiError) {
  if (error.status === 401 && error.code === "UNAUTHENTICATED") {
    window.dispatchEvent(new Event("auth:unauthorized"));
  }
  return error;
}
