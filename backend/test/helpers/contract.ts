import { expect } from 'vitest';
import { z } from 'zod';

/** Schema hợp đồng ARCHITECTURE §A7.2–§A7.4, dùng `.strict()` để phát hiện trường thừa. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

export const userDtoSchema = z.object({ id: uuid, email: z.string(), displayName: z.string(), createdAt: isoDate }).strict();

export const documentDtoSchema = z
  .object({
    id: uuid,
    title: z.string(),
    description: z.string().nullable(),
    visibility: z.enum(['PUBLIC', 'PRIVATE']),
    fileType: z.enum(['PDF', 'DOCX', 'PPTX']),
    originalFilename: z.string(),
    sizeBytes: z.number().int().min(1).max(52_428_800),
    fileVersion: z.number().int().min(1),
    owner: z.object({ id: uuid, displayName: z.string() }).strict(),
    isOwner: z.boolean(),
    createdAt: isoDate,
    updatedAt: isoDate,
    fileUpdatedAt: isoDate,
  })
  .strict();

export const pageSchema = z
  .object({
    items: z.array(documentDtoSchema),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(50),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .strict();

const issueCodes = [
  'REQUIRED', 'INVALID_TYPE', 'INVALID_FORMAT', 'TOO_SHORT', 'TOO_LONG', 'OUT_OF_RANGE',
  'INVALID_ENUM', 'UNKNOWN_FIELD', 'EMPTY_FILE', 'TOO_MANY_FILES', 'NO_CHANGES', 'UNAVAILABLE',
] as const;

export const errorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string().min(1),
        details: z.array(z.object({ field: z.string(), issue: z.enum(issueCodes), message: z.string() }).strict()),
        requestId: uuid,
      })
      .strict(),
  })
  .strict();

type HttpResponse = { status: number; body: unknown; headers: Record<string, string | string[] | undefined> };

/** Kiểm envelope lỗi + mã + requestId trùng header (§A7.2). */
export function expectError(res: HttpResponse, status: number, code: string): { field: string; issue: string }[] {
  expect(res.status, JSON.stringify(res.body)).toBe(status);
  const parsed = errorEnvelopeSchema.parse(res.body);
  expect(parsed.error.code).toBe(code);
  expect(parsed.error.requestId).toBe(res.headers['x-request-id']);
  return parsed.error.details;
}

export function expectDocument(value: unknown): z.infer<typeof documentDtoSchema> {
  return documentDtoSchema.parse(value);
}
