import { pipeline } from 'node:stream/promises';
import type { Request, RequestHandler } from 'express';
import { removeFileQuietly } from '../../cleanup/tmp-sweeper.js';
import { AppError, validationError, type ValidationIssue } from '../../http/errors.js';
import { issueMessage, parseOrThrow, safeParseIssues } from '../../http/validate.js';
import type { Logger } from '../../lib/logger.js';
import { attachmentDisposition } from '../files/content-disposition.js';
import { inspectFile } from '../files/file-inspector.js';
import { toDocumentDto } from './document.mapper.js';
import { loadedDocument } from './document.loader.js';
import { createFieldsSchema, mineQuerySchema, patchSchema, publicQuerySchema, replaceFieldsSchema } from './documents.schemas.js';
import type { DocumentService } from './documents.service.js';

function requireUser(req: Request): { userId: string } {
  if (!req.auth) throw new AppError('UNAUTHENTICATED');
  return req.auth;
}

/** Part văn bản + tệp → danh sách lỗi gộp (U3), `file` thiếu → REQUIRED. */
function multipartIssues(req: Request, fieldIssues: ValidationIssue[]): ValidationIssue[] {
  const issues = [...fieldIssues];
  if (!req.file) issues.push({ field: 'file', issue: 'REQUIRED', message: issueMessage('file', 'REQUIRED') });
  return issues;
}

export function createDocumentsController(service: DocumentService, logger: Logger) {
  /** API-07 */
  const searchPublic: RequestHandler = async (req, res) => {
    const query = parseOrThrow(publicQuerySchema, req.query);
    res.json({ data: await service.searchPublic(query, req.auth) });
  };

  /** API-08 */
  const listMine: RequestHandler = async (req, res) => {
    const user = requireUser(req);
    const query = parseOrThrow(mineQuerySchema, req.query);
    res.json({ data: await service.listMine(user.userId, query) });
  };

  /** API-09 (loader đã áp canView) */
  const getOne: RequestHandler = (req, res) => {
    res.json({ data: toDocumentDto(loadedDocument(res), req.auth?.userId) });
  };

  /** API-10 */
  const create: RequestHandler = async (req, res) => {
    const user = requireUser(req);
    try {
      const fields = safeParseIssues(createFieldsSchema, { ...(req.body ?? {}) });
      const issues = multipartIssues(req, fields.success ? [] : fields.issues);
      if (issues.length > 0 || !fields.success || !req.file) throw validationError(issues);
      const inspected = await inspectFile(req.file.path, req.file.originalname, req.file.size);
      const dto = await service.create(user.userId, fields.data, inspected);
      res.locals.auditTargetId = dto.id;
      res.locals.auditMetadata = { visibility: dto.visibility, fileType: dto.fileType, sizeBytes: dto.sizeBytes };
      res.status(201).location(`/api/documents/${dto.id}`).json({ data: dto });
    } finally {
      await removeFileQuietly(req.file?.path);
    }
  };

  /** API-11 */
  const update: RequestHandler = async (req, res) => {
    const user = requireUser(req);
    const patch = parseOrThrow(patchSchema, req.body ?? {});
    const dto = await service.updateMetadata(loadedDocument(res), patch, user.userId);
    res.locals.auditMetadata = { fields: Object.keys(patch), visibility: dto.visibility };
    res.json({ data: dto });
  };

  /** API-12 (loader đã áp canManage trước khi multer đọc body) */
  const replaceFile: RequestHandler = async (req, res) => {
    const user = requireUser(req);
    try {
      const fields = safeParseIssues(replaceFieldsSchema, { ...(req.body ?? {}) });
      const issues = multipartIssues(req, fields.success ? [] : fields.issues);
      if (issues.length > 0 || !req.file) throw validationError(issues);
      const inspected = await inspectFile(req.file.path, req.file.originalname, req.file.size);
      const dto = await service.replaceFile(loadedDocument(res), inspected, user.userId);
      res.locals.auditMetadata = { fileType: dto.fileType, sizeBytes: dto.sizeBytes, fileVersion: dto.fileVersion };
      res.json({ data: dto });
    } finally {
      await removeFileQuietly(req.file?.path);
    }
  };

  /** API-13: stream từ storage; lỗi sau khi gửi header → huỷ kết nối (errorHandler). */
  const download: RequestHandler = async (_req, res) => {
    const doc = loadedDocument(res);
    const object = await service.openDownload(doc);
    res.status(200).set({
      'Content-Type': doc.mimeType,
      'Content-Length': String(object.contentLength),
      'Content-Disposition': attachmentDisposition(doc.originalFilename),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    try {
      await pipeline(object.body, res);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ERR_STREAM_PREMATURE_CLOSE') {
        logger.debug({ documentId: doc.id, event: 'download.client_aborted' }, 'Client ngắt tải xuống');
        return;
      }
      throw error;
    }
  };

  /** API-14 */
  const remove: RequestHandler = async (_req, res) => {
    await service.delete(loadedDocument(res));
    res.status(204).end();
  };

  return { searchPublic, listMine, getOne, create, update, replaceFile, download, remove };
}
