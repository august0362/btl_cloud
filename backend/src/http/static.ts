import { existsSync } from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import type { Logger } from '../lib/logger.js';

/**
 * Phục vụ SPA cùng origin khi SERVE_FRONTEND=true (§A3.7). Gọi sau router /api và 404 của /api.
 * `/assets/*` có hash → immutable; các route SPA → index.html no-cache.
 */
export function serveFrontend(app: Express, distDir: string, logger: Logger): void {
  const root = path.resolve(distDir);
  const indexHtml = path.join(root, 'index.html');
  if (!existsSync(indexHtml)) {
    logger.warn({ distDir: root, event: 'static.missing_dist' }, 'Không thấy frontend/dist/index.html — chỉ phục vụ API');
    return;
  }

  // Never send the SPA (or static files) for the local-only control namespace.
  app.use('/__local', (_req, res) => { res.status(404).type('text/plain').send('Not Found'); });

  app.use(
    express.static(root, {
      index: false,
      setHeaders: (res, filePath) => {
        const relative = path.relative(root, filePath).split(path.sep).join('/');
        res.setHeader('Cache-Control', relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );

  app.use((req, res, next) => {
    const wantsHtml = (req.headers.accept ?? '').includes('text/html');
    if ((req.method === 'GET' || req.method === 'HEAD') && wantsHtml && !req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexHtml);
      return;
    }
    next();
  });
}
