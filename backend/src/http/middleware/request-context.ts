import { randomUUID } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from '../../lib/logger.js';
import { moduleOf } from '../../lib/module-of.js';
import type { AuthContext } from '../../modules/auth/auth.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** UUID của request, trùng header X-Request-Id và `error.requestId`. */
    id: string;
    /** null = Guest (sau sessionLoader). */
    auth: AuthContext | null;
  }
}

export function requestId(): RequestHandler {
  return (req, res, next) => {
    req.id = randomUUID();
    req.auth = null;
    res.setHeader('X-Request-Id', req.id);
    next();
  };
}

/** Log mỗi request: requestId, method, path, status, durationMs, userId, instanceId (§A5.8, NFR-OBS-02). */
export function requestLogger(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req) => (req as unknown as { id: string }).id,
    customAttributeKeys: { responseTime: 'durationMs' },
    customProps: (req) => ({
      requestId: (req as unknown as { id: string }).id,
      userId: (req as unknown as { auth: AuthContext | null }).auth?.userId ?? null,
    }),
    customSuccessObject: (req, res, value) => ({
      ...value,
      module: moduleOf((req as Request).originalUrl),
      code: (res as Response).locals.errorCode ?? null,
      stage: (res as Response).locals.errorStage ?? null,
    }),
    customErrorObject: (req, res, _error, value) => ({
      ...value,
      module: moduleOf((req as Request).originalUrl),
      code: (res as Response).locals.errorCode ?? null,
      stage: (res as Response).locals.errorStage ?? null,
    }),
    customLogLevel: (_req, res, error) => (error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    serializers: {
      req: (req: { id: string; method: string; url: string; headers: Record<string, unknown> }) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        headers: { cookie: req.headers.cookie, 'user-agent': req.headers['user-agent'], origin: req.headers.origin },
      }),
      res: (res: { statusCode: number; headers: Record<string, unknown> }) => ({
        statusCode: res.statusCode,
        headers: { 'set-cookie': res.headers['set-cookie'] },
      }),
    },
    // Không log health check của ALB ở mức info để tránh nhiễu.
    autoLogging: { ignore: (req) => req.url === '/api/health' },
  });
}

/** Mọi JSON dưới /api không được cache (§A5.8). */
export function noStore(): RequestHandler {
  return (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };
}
