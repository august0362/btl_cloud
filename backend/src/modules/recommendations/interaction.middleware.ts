import type { RequestHandler } from 'express';
import type { InteractionKind } from '@prisma/client';
import { loadedDocument } from '../documents/document.loader.js';
import type { RecommendationService } from './recommendations.service.js';

export function trackInteraction(service: RecommendationService, kind: InteractionKind): RequestHandler {
  return (req, res, next) => {
    if (service.isEnabled && req.auth) {
      const userId = req.auth.userId, doc = loadedDocument(res);
      if (doc.ownerId !== userId && doc.visibility === 'PUBLIC') res.once('finish', () => {
        if (res.writableFinished && (kind === 'DOWNLOAD' ? res.statusCode === 200 : res.statusCode >= 200 && res.statusCode < 300)) void service.repository.record(userId, doc.id, kind, service.now()).catch(() => service.writeFailed());
      });
    }
    next();
  };
}
