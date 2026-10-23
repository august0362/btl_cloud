import { createHash, randomBytes } from 'node:crypto';

/** Token opaque 256 bit (43 ký tự base64url); DB chỉ lưu SHA-256 hex (§A5.2). */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
