import type { PrismaClient } from '@prisma/client';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { Config } from './config/env.js';
import type { Services } from './container.js';
import { csrfGuard, sessionLoader } from './http/middleware/auth.js';
import { apiNotFound, errorHandler } from './http/middleware/error-handler.js';
import { noStore, requestId, requestLogger } from './http/middleware/request-context.js';
import { securityHeaders } from './http/middleware/security-headers.js';
import { serveFrontend } from './http/static.js';
import type { Logger } from './lib/logger.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import type { SessionCookieConfig } from './modules/auth/session.cookie.js';
import { documentRoutes } from './modules/documents/documents.routes.js';
import { createUploadMiddleware } from './modules/files/upload.middleware.js';
import { healthRoutes } from './modules/health/health.routes.js';
import type { ObjectStorage } from './storage/object-storage.js';

export interface AppDeps {
  config: Config;
  logger: Logger;
  prisma: PrismaClient;
  storage: ObjectStorage;
  services: Services;
}

/** Express app theo pipeline §A3.8. Dùng trực tiếp trong Supertest. */
export function createApp(deps: AppDeps): Express {
  const { config, logger, prisma, storage, services } = deps;
  const cookie: SessionCookieConfig = { name: config.session.cookieName, secure: config.cookieSecure, ttlHours: config.session.ttlHours };

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(requestId());
  app.use(requestLogger(logger));
  app.use(securityHeaders({ hstsEnabled: config.hstsEnabled }));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  const api = express.Router();
  api.use(noStore());
  api.use(csrfGuard(config.allowedOrigins));
  api.use(sessionLoader(services.auth, cookie));
  api.use(
    '/health',
    healthRoutes({
      instanceId: config.instanceId,
      version: config.version,
      checkDatabase: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
      checkStorage: () => storage.checkHealth(),
    }),
  );
  api.use('/auth', authRoutes(services.auth, cookie, config.authRateLimitMax));
  api.use(
    '/documents',
    documentRoutes({
      service: services.documentService,
      repository: services.documents,
      upload: createUploadMiddleware(config.upload.tmpDir),
      logger,
    }),
  );
  api.use(apiNotFound);
  app.use('/api', api);

  if (config.serveFrontend) serveFrontend(app, config.frontendDistDir, logger);
  app.use((_req, res) => {
    res.status(404).type('text/plain').send('Not Found');
  });
  app.use(errorHandler(logger));
  return app;
}
