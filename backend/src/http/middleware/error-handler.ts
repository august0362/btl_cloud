import type { ErrorRequestHandler, RequestHandler } from 'express';
import { removeFileQuietly } from '../../cleanup/tmp-sweeper.js';
import type { Logger } from '../../lib/logger.js';
import { moduleOf } from '../../lib/module-of.js';
import { AppError } from '../errors.js';

export const apiNotFound: RequestHandler = (_req, _res, next) => next(new AppError('ROUTE_NOT_FOUND'));

/** Lỗi của body-parser (express.json) → INVALID_JSON / PAYLOAD_TOO_LARGE (§A7.3). */
function fromBodyParser(error: unknown): AppError | null {
  if (typeof error !== 'object' || error === null || !('type' in error)) return null;
  const type = (error as { type?: unknown }).type;
  if (type === 'entity.too.large') return new AppError('PAYLOAD_TOO_LARGE');
  if (typeof type === 'string' && (type === 'entity.parse.failed' || type.endsWith('.unsupported') || type === 'request.aborted')) {
    return new AppError('INVALID_JSON');
  }
  return null;
}

/**
 * Map mọi lỗi sang envelope §A7.2; lỗi lạ → 500, log stack, không trả stack cho client.
 * Luôn xoá tệp tạm còn sót; với request còn body chưa đọc (multipart bị từ chối sớm) → xả body + Connection: close.
 */
export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error, req, res, _next) => {
    void removeFileQuietly(req.file?.path);

    let appError: AppError;
    if (error instanceof AppError) appError = error;
    else appError = fromBodyParser(error) ?? new AppError('INTERNAL_ERROR', { cause: error });

    res.locals.errorCode = appError.code;
    res.locals.errorStage = appError.stage ?? null;
    const diagnostic = { requestId: req.id, module: moduleOf(req.originalUrl), code: appError.code, stage: appError.stage ?? null };

    if (res.headersSent) {
      logger.error({ err: error, ...diagnostic, event: 'response.aborted' }, 'Lỗi sau khi đã gửi header');
      res.destroy();
      return;
    }

    if (appError.status >= 500) logger.error({ err: error, ...diagnostic }, 'Lỗi xử lý request');

    if (!req.complete) {
      res.setHeader('Connection', 'close');
      req.resume();
    }

    res
      .status(appError.status)
      .set(appError.headers)
      .json({ error: { code: appError.code, message: appError.message, details: appError.details, requestId: req.id } });
  };
}
