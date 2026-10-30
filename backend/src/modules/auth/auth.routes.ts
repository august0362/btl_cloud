import { Router } from 'express';
import { authRateLimit } from '../../http/middleware/auth.js';
import type { Audited } from '../audit/audited.js';
import { createAuthController } from './auth.controller.js';
import type { AuthService } from './auth.service.js';
import type { SessionCookieConfig } from './session.cookie.js';

export function authRoutes(auth: AuthService, cookie: SessionCookieConfig, rateLimitMax: number, audited: Audited): Router {
  const controller = createAuthController(auth, cookie);
  const router = Router();
  router.get('/me', controller.me);
  router.post('/register', authRateLimit({ limit: rateLimitMax, countSuccessful: true }), audited('AUTH_REGISTER'), controller.register);
  router.post('/login', authRateLimit({ limit: rateLimitMax, countSuccessful: false }), audited('AUTH_LOGIN'), controller.login);
  router.post('/logout', audited('AUTH_LOGOUT'), controller.logout);
  return router;
}
