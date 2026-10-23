import { randomUUID } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** UUID v4 sinh ở tầng ứng dụng (D-11). */
export function newId(): string {
  return randomUUID();
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
