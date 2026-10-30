import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../http/middleware/auth.js';
import type { Logger } from '../../lib/logger.js';
import type { Audited } from '../audit/audited.js';
import { loadDocument } from './document.loader.js';
import type { DocumentRepository } from './document.repository.js';
import { createDocumentsController } from './documents.controller.js';
import type { DocumentService } from './documents.service.js';

/** API-07 … API-14. `/mine` phải đăng ký trước `/:id` (§A7.1). */
export function documentRoutes(deps: {
  service: DocumentService;
  repository: DocumentRepository;
  upload: RequestHandler;
  logger: Logger;
  audited: Audited;
}): Router {
  const controller = createDocumentsController(deps.service, deps.logger);
  const view = loadDocument(deps.repository, 'view');
  const manage = loadDocument(deps.repository, 'manage');
  const { audited } = deps;
  const router = Router();

  router.get('/', controller.searchPublic);
  router.get('/mine', requireAuth, controller.listMine);
  router.post('/', audited('DOCUMENT_UPLOAD'), requireAuth, deps.upload, controller.create);
  router.get('/:id', view, controller.getOne);
  router.patch('/:id', audited('DOCUMENT_UPDATE'), requireAuth, manage, controller.update);
  router.put('/:id/file', audited('DOCUMENT_REPLACE'), requireAuth, manage, deps.upload, controller.replaceFile);
  router.get('/:id/download', audited('DOCUMENT_DOWNLOAD'), requireAuth, view, controller.download);
  router.delete('/:id', audited('DOCUMENT_DELETE'), requireAuth, manage, controller.remove);
  return router;
}
