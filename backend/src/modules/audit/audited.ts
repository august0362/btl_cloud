import type { Request, RequestHandler, Response } from 'express';
import { AUDIT_ACTIONS, type AuditAction, type AuditEventInput, type AuditRecorder } from './audit.recorder.js';

export type Audited = (action: AuditAction) => RequestHandler;

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Quy tắc ghi §A12.7: SUCCESS khi 2xx; FAILURE khi ≥ 400 và biết actor, hoặc với AUTH_LOGIN/AUTH_REGISTER
 * (actor ANONYMOUS, không có đối tượng). Client ngắt trước khi response xong → FAILURE `CLIENT_ABORTED`.
 * Trả null khi không ghi (vd. Guest bị 401 ở route khác).
 */
export function auditEventFor(action: AuditAction, req: Request, res: Response, paramId: string | null): AuditEventInput | null {
  const aborted = !res.writableFinished;
  const success = !aborted && res.statusCode >= 200 && res.statusCode < 300;
  if (!success && !aborted && res.statusCode < 400) return null;

  const isAuthAction = action === 'AUTH_LOGIN' || action === 'AUTH_REGISTER';
  let actorId = stringOrNull(res.locals.auditActorId) ?? req.auth?.userId ?? null;
  if (!success && isAuthAction) actorId = null;
  else if (!success && actorId === null) return null;

  const { targetType } = AUDIT_ACTIONS[action];
  let targetId = stringOrNull(res.locals.auditTargetId) ?? paramId ?? (targetType === 'USER' ? actorId : null);
  if (!success && isAuthAction) targetId = null;

  return {
    actorType: actorId === null ? 'ANONYMOUS' : 'USER',
    actorId,
    action,
    targetType: targetId === null ? null : targetType,
    targetId,
    outcome: success ? 'SUCCESS' : 'FAILURE',
    errorCode: success ? null : aborted ? 'CLIENT_ABORTED' : stringOrNull(res.locals.errorCode),
    requestId: req.id ?? null,
    metadata: res.locals.auditMetadata as Record<string, unknown> | undefined,
  };
}

/**
 * XD-12: `audited(action)` gắn theo route, ghi khi response đóng (`close`), request không chờ.
 * Controller có thể đặt `res.locals.auditActorId`, `auditTargetId`, `auditMetadata`; XM-14 đặt `res.locals.errorCode`.
 */
export function createAudited(recorder: AuditRecorder): Audited {
  return (action) => (req, res, next) => {
    // req.params chỉ đúng khi route đang khớp → lấy ngay, không đợi `close`.
    const paramId = stringOrNull(req.params.id);
    res.once('close', () => {
      let event: AuditEventInput | null;
      try {
        event = auditEventFor(action, req, res, paramId);
      } catch (error) {
        recorder.reportWriteFailure(error, action, req.id ?? null);
        return;
      }
      if (event) recorder.record(event);
    });
    next();
  };
}
