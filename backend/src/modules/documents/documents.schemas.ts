import { z } from 'zod';
import { codePointLength, descriptionField, requiredText } from '../../http/validate.js';

/** Schema theo ARCHITECTURE §A7.5. */
const visibilityEnum = z.enum(['PUBLIC', 'PRIVATE']);
const fileTypeEnum = z.enum(['PDF', 'DOCX', 'PPTX']);
const titleField = requiredText({ max: 200, emptyIssue: 'TOO_SHORT' });

/** Part văn bản của API-10. Part lạ → UNKNOWN_FIELD. */
export const createFieldsSchema = z
  .object({ title: titleField, description: descriptionField.optional(), visibility: visibilityEnum })
  .strict();

/** API-12 chỉ nhận part `file` — mọi part văn bản đều là trường lạ. */
export const replaceFieldsSchema = z.object({}).strict();

export const patchSchema = z
  .object({ title: titleField.optional(), description: descriptionField.optional(), visibility: visibilityEnum.optional() })
  .strict()
  .superRefine((value, ctx) => {
    if (value.title === undefined && value.description === undefined && value.visibility === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, params: { issue: 'NO_CHANGES' } });
    }
  });

const queryText = z
  .string()
  .transform((value) => value.trim())
  .superRefine((value, ctx) => {
    if (codePointLength(value) > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, params: { issue: 'TOO_LONG', limit: 100 } });
  })
  .transform((value) => (value.length === 0 ? undefined : value));

export const publicQuerySchema = z.object({
  q: queryText.optional(),
  fileType: fileTypeEnum.optional(),
  sort: z.enum(['newest', 'title']).default('newest'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export const mineQuerySchema = publicQuerySchema.extend({ visibility: visibilityEnum.optional() });

export type PublicQuery = z.output<typeof publicQuerySchema>;
export type MineQuery = z.output<typeof mineQuerySchema>;
export type CreateFields = z.output<typeof createFieldsSchema>;
export type PatchInput = z.output<typeof patchSchema>;
