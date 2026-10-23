import { z } from 'zod';
import { emailField, passwordField, requiredText } from '../../http/validate.js';

/** API-04 / API-05 (§A7.5). `.strict()` → trường lạ bị từ chối với UNKNOWN_FIELD. */
export const registerSchema = z
  .object({
    email: emailField,
    password: passwordField(8, 128),
    displayName: requiredText({ max: 100, emptyIssue: 'REQUIRED' }),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailField,
    password: passwordField(1, 128),
  })
  .strict();
