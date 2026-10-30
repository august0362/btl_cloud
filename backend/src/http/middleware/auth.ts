import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import type { AuthService } from '../../modules/auth/auth.service.js';
import { clearSessionCookie, type SessionCookieConfig } from '../../modules/auth/session.cookie.js';
import type { ActivityTracker } from '../../modules/users/activity-tracker.js';
import { AppError } from '../errors.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF (§A5.4): POST/PUT/PATCH/DELETE bắt buộc `X-CSRF-Protection: 1`; có `Origin` thì phải thuộc allowlist.
 * Không bật CORS nên trang khác không thể gắn custom header vào request cross-origin.
 */
export function csrfGuard(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, _res, next) => {
    if (!UNSAFE_METHODS.has(req.method)) return next();
    if (req.get('x-csrf-protection') !== '1') return next(new AppError('CSRF_REJECTED'));
    const origin = req.get('origin');
    if (origin !== undefined && !allowed.has(origin)) return next(new AppError('CSRF_REJECTED'));
    next();
  };
}

/**
 * Nạp phiên từ cookie (§A5.2). Cookie không hợp lệ/hết hạn → xoá cookie, phục vụ như Guest.
 * Phiên hợp lệ → ghi hoạt động gần nhất (XM-01), không chờ.
 */
export function sessionLoader(auth: AuthService, cookie: SessionCookieConfig, activity: ActivityTracker): RequestHandler {
  return async (req, res, next) => {
    const token: unknown = req.cookies?.[cookie.name];
    if (typeof token !== 'string' || token.length === 0) {
      req.auth = null;
      return next();
    }
    req.auth = await auth.resolveSession(token);
    if (req.auth) activity.touch(req.auth.userId);
    else clearSessionCookie(res, cookie);
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new AppError('UNAUTHENTICATED'));
  next();
};

/**
 * Rate limit theo IP cho API-04/05, lưu trong bộ nhớ → giới hạn theo từng instance (RK-10, §A5.6).
 * Login chỉ đếm lần thất bại.
 */
export function authRateLimit(options: { limit: number; countSuccessful: boolean }): RequestHandler {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.limit,
    skipSuccessfulRequests: !options.countSuccessful,
    standardHeaders: false,
    legacyHeaders: false,
    handler: (req, res, next) => {
      const resetTime = (req as unknown as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
      const retryAfter = resetTime ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)) : 900;
      next(new AppError('RATE_LIMITED', { headers: { 'Retry-After': String(retryAfter) } }));
    },
  });
}
