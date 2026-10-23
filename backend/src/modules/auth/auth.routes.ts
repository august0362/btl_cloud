import { Router } from 'express';
import { authRateLimit } from '../../http/middleware/auth.js';
import { createAuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { SessionCookieConfig } from './session.cookie.js';

export function authRoutes(auth: AuthService, cookie: SessionCookieConfig, rateLimitMax: number): Router {
  const controller = createAuthController(auth, cookie);
  const router = Router();
  router.get('/me', controller.me);
  router.post('/register', authRateLimit({ limit: rateLimitMax, countSuccessful: true }), controller.register);
  router.post('/login', authRateLimit({ limit: rateLimitMax, countSuccessful: false }), controller.login);
  router.post('/logout', controller.logout);
  return router;
}
