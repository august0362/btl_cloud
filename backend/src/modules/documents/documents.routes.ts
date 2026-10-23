import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../../http/middleware/auth.js';
import type { Logger } from '../../lib/logger.js';
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
}): Router {
  const controller = createDocumentsController(deps.service, deps.logger);
  const view = loadDocument(deps.repository, 'view');
  const manage = loadDocument(deps.repository, 'manage');
  const router = Router();

  router.get('/', controller.searchPublic);
  router.get('/mine', requireAuth, controller.listMine);
  router.post('/', requireAuth, deps.upload, controller.create);
  router.get('/:id', view, controller.getOne);
  router.patch('/:id', requireAuth, manage, controller.update);
  router.put('/:id/file', requireAuth, manage, deps.upload, controller.replaceFile);
  router.get('/:id/download', requireAuth, view, controller.download);
  router.delete('/:id', requireAuth, manage, controller.remove);
  return router;
}
