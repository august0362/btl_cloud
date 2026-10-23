import { z, type ZodError, type ZodIssue, type ZodTypeAny } from 'zod';
import { validationError, type IssueCode, type ValidationIssue } from './errors.js';

/** Nhãn tiếng Việt dùng trong `details[].message` (ARCHITECTURE §A7.5). */
const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  password: 'Mật khẩu',
  displayName: 'Tên hiển thị',
  title: 'Tiêu đề',
  description: 'Mô tả',
  visibility: 'Chế độ hiển thị',
  file: 'Tệp',
  q: 'Từ khoá',
  fileType: 'Loại tệp',
  sort: 'Sắp xếp',
  page: 'Trang',
  pageSize: 'Số mục mỗi trang',
  body: 'Dữ liệu',
};

function label(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function issueMessage(field: string, issue: IssueCode, limit?: number): string {
  const name = label(field);
  switch (issue) {
    case 'REQUIRED':
      return `${name} là bắt buộc.`;
    case 'INVALID_TYPE':
      return `${name} có kiểu dữ liệu không hợp lệ.`;
    case 'INVALID_FORMAT':
      return `${name} không đúng định dạng.`;
    case 'TOO_SHORT':
      return limit && limit > 1 ? `${name} tối thiểu ${limit} ký tự.` : `${name} không được để trống.`;
    case 'TOO_LONG':
      return limit ? `${name} tối đa ${limit} ký tự.` : `${name} quá dài.`;
    case 'OUT_OF_RANGE':
      return `${name} nằm ngoài phạm vi cho phép.`;
    case 'INVALID_ENUM':
      return `${name} không hợp lệ.`;
    case 'UNKNOWN_FIELD':
      return `Trường "${field}" không được hỗ trợ.`;
    case 'EMPTY_FILE':
      return 'Tệp rỗng, vui lòng chọn tệp khác.';
    case 'TOO_MANY_FILES':
      return 'Chỉ được gửi một tệp.';
    case 'NO_CHANGES':
      return 'Cần gửi ít nhất một trường để cập nhật.';
    case 'UNAVAILABLE':
      return `${name} không khả dụng.`;
  }
}

/** Độ dài theo Unicode code point, khớp cách MySQL đếm VARCHAR (§A7.1). */
export function codePointLength(value: string): number {
  return [...value].length;
}

function addIssue(ctx: z.RefinementCtx, issue: IssueCode, limit?: number): void {
  ctx.addIssue({ code: z.ZodIssueCode.custom, params: { issue, limit } });
}

// Cố ý khớp ký tự điều khiển để từ chối chúng trong tiêu đề/tên/mô tả (§A7.5).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_EXCEPT_WHITESPACE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Chuỗi bắt buộc: trim, không ký tự điều khiển, giới hạn code point. */
export function requiredText(options: { max: number; emptyIssue: 'REQUIRED' | 'TOO_SHORT' }) {
  return z
    .string()
    .transform((value) => value.trim())
    .superRefine((value, ctx) => {
      if (value.length === 0) return addIssue(ctx, options.emptyIssue);
      if (CONTROL_CHARS.test(value)) return addIssue(ctx, 'INVALID_FORMAT');
      if (codePointLength(value) > options.max) addIssue(ctx, 'TOO_LONG', options.max);
    });
}

/** Mô tả: string | null; trim; "" → null; cho phép \t \n \r (§A7.5). */
export const descriptionField = z
  .string()
  .nullable()
  .transform((value) => {
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  })
  .superRefine((value, ctx) => {
    if (value === null) return;
    if (CONTROL_CHARS_EXCEPT_WHITESPACE.test(value)) return addIssue(ctx, 'INVALID_FORMAT');
    if (codePointLength(value) > 2000) addIssue(ctx, 'TOO_LONG', 2000);
  });

/** Mật khẩu: không trim; "" coi như thiếu. */
export function passwordField(min: number, max: number) {
  return z.string().superRefine((value, ctx) => {
    if (value.length === 0) return addIssue(ctx, 'REQUIRED');
    const length = codePointLength(value);
    if (length < min) return addIssue(ctx, 'TOO_SHORT', min);
    if (length > max) addIssue(ctx, 'TOO_LONG', max);
  });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const emailField = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .superRefine((value, ctx) => {
    if (value.length === 0) return addIssue(ctx, 'REQUIRED');
    if (codePointLength(value) > 254) return addIssue(ctx, 'TOO_LONG', 254);
    if (value.length < 3 || !EMAIL_PATTERN.test(value)) addIssue(ctx, 'INVALID_FORMAT');
  });

function toIssues(issue: ZodIssue): ValidationIssue[] {
  const field = issue.path.length > 0 ? issue.path.map(String).join('.') : 'body';
  switch (issue.code) {
    case 'unrecognized_keys':
      return issue.keys.map((key) => ({ field: key, issue: 'UNKNOWN_FIELD', message: issueMessage(key, 'UNKNOWN_FIELD') }));
    case 'invalid_type': {
      const code: IssueCode = issue.received === 'undefined' ? 'REQUIRED' : 'INVALID_TYPE';
      return [{ field, issue: code, message: issueMessage(field, code) }];
    }
    case 'invalid_enum_value':
      return [{ field, issue: 'INVALID_ENUM', message: issueMessage(field, 'INVALID_ENUM') }];
    case 'too_small':
    case 'too_big': {
      if (issue.type === 'string') {
        const code: IssueCode = issue.code === 'too_small' ? 'TOO_SHORT' : 'TOO_LONG';
        const limit = Number(issue.code === 'too_small' ? issue.minimum : issue.maximum);
        return [{ field, issue: code, message: issueMessage(field, code, limit) }];
      }
      return [{ field, issue: 'OUT_OF_RANGE', message: issueMessage(field, 'OUT_OF_RANGE') }];
    }
    case 'custom': {
      const params = (issue.params ?? {}) as { issue?: IssueCode; limit?: number };
      const code = params.issue ?? 'INVALID_FORMAT';
      return [{ field, issue: code, message: issueMessage(field, code, params.limit) }];
    }
    default:
      return [{ field, issue: 'INVALID_FORMAT', message: issueMessage(field, 'INVALID_FORMAT') }];
  }
}

export function zodToValidationIssues(error: ZodError): ValidationIssue[] {
  return error.issues.flatMap(toIssues);
}

export function safeParseIssues<T extends ZodTypeAny>(
  schema: T,
  data: unknown,
): { success: true; data: z.output<T> } | { success: false; issues: ValidationIssue[] } {
  const result = schema.safeParse(data);
  return result.success ? { success: true, data: result.data } : { success: false, issues: zodToValidationIssues(result.error) };
}

export function parseOrThrow<T extends ZodTypeAny>(schema: T, data: unknown): z.output<T> {
  const result = safeParseIssues(schema, data);
  if (!result.success) throw validationError(result.issues);
  return result.data;
}
