import type { CookieOptions, Response } from 'express';

export interface SessionCookieConfig {
  name: string;
  secure: boolean;
  ttlHours: number;
}

/** Thuộc tính cookie theo ARCHITECTURE §A5.3: HttpOnly, SameSite=Lax, Path=/, không Domain. */
function baseOptions(config: SessionCookieConfig): CookieOptions {
  return { httpOnly: true, secure: config.secure, sameSite: 'lax', path: '/' };
}

export function setSessionCookie(res: Response, config: SessionCookieConfig, token: string): void {
  res.cookie(config.name, token, { ...baseOptions(config), maxAge: config.ttlHours * 3600 * 1000 });
}

export function clearSessionCookie(res: Response, config: SessionCookieConfig): void {
  res.cookie(config.name, '', { ...baseOptions(config), maxAge: 0 });
}
