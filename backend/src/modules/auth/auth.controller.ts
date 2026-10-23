import type { RequestHandler } from 'express';
import { parseOrThrow } from '../../http/validate.js';
import { toUserDto } from '../users/user.mapper.js';
import { loginSchema, registerSchema } from './auth.schemas.js';
import type { AuthService } from './auth.service.js';
import { clearSessionCookie, setSessionCookie, type SessionCookieConfig } from './session.cookie.js';

export function createAuthController(auth: AuthService, cookie: SessionCookieConfig) {
  const currentToken = (cookies: Record<string, unknown> | undefined): string | undefined => {
    const value = cookies?.[cookie.name];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  /** API-03: không bao giờ 401; Guest → user null (cookie lỗi đã được sessionLoader xoá). */
  const me: RequestHandler = (req, res) => {
    res.json({ data: { user: req.auth ? toUserDto(req.auth.user) : null } });
  };

  /** API-04: tạo tài khoản và đăng nhập luôn (OD-04). */
  const register: RequestHandler = async (req, res) => {
    const input = parseOrThrow(registerSchema, req.body ?? {});
    const result = await auth.register(input, currentToken(req.cookies));
    setSessionCookie(res, cookie, result.token);
    res.status(201).json({ data: { user: result.user } });
  };

  /** API-05 */
  const login: RequestHandler = async (req, res) => {
    const input = parseOrThrow(loginSchema, req.body ?? {});
    const result = await auth.login(input, currentToken(req.cookies));
    setSessionCookie(res, cookie, result.token);
    res.status(200).json({ data: { user: result.user } });
  };

  /** API-06: idempotent, luôn 204. */
  const logout: RequestHandler = async (req, res) => {
    await auth.logout(currentToken(req.cookies));
    clearSessionCookie(res, cookie);
    res.status(204).end();
  };

  return { me, register, login, logout };
}
