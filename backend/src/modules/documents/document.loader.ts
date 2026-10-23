import type { RequestHandler, Response } from 'express';
import { AppError } from '../../http/errors.js';
import { isUuid } from '../../lib/ids.js';
import { canManage, canView } from './document.policy.js';
import type { DocumentRepository, DocumentWithOwner } from './document.repository.js';

/**
 * Nạp tài liệu theo `:id` và áp policy TRƯỚC khi đọc body (§A5.5, RK-02).
 * `id` sai định dạng hoặc không tồn tại → 404; Private của người khác → 404; quản lý Public của người khác → 403.
 */
export function loadDocument(documents: DocumentRepository, mode: 'view' | 'manage'): RequestHandler {
  return async (req, res, next) => {
    const id = String(req.params.id ?? '');
    if (!isUuid(id)) return next(new AppError('DOCUMENT_NOT_FOUND'));
    const doc = await documents.findById(id);
    if (!doc) return next(new AppError('DOCUMENT_NOT_FOUND'));

    let decision: 'ALLOW' | 'NOT_FOUND' | 'FORBIDDEN';
    if (mode === 'view') decision = canView(doc, req.auth);
    else if (!req.auth) return next(new AppError('UNAUTHENTICATED'));
    else decision = canManage(doc, req.auth);

    if (decision === 'NOT_FOUND') return next(new AppError('DOCUMENT_NOT_FOUND'));
    if (decision === 'FORBIDDEN') return next(new AppError('FORBIDDEN'));
    res.locals.document = doc;
    next();
  };
}

export function loadedDocument(res: Response): DocumentWithOwner {
  return res.locals.document as DocumentWithOwner;
}
