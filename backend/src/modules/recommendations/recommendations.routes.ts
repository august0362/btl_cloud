import { Router } from 'express';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { AppError } from '../../http/errors.js';
import { requireAuth } from '../../http/middleware/auth.js';
import { codePointLength, parseOrThrow } from '../../http/validate.js';
import type { RecommendationService } from './recommendations.service.js';

export const relatedQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(12).default(6) });
const homeQuery = z.object({ limit: z.coerce.number().int().min(1).max(20).default(8) });
const suggestionQuery = z.object({ q: z.string().trim().default('').superRefine((q, ctx) => { if (codePointLength(q) > 100) ctx.addIssue({ code: z.ZodIssueCode.custom, params: { issue: 'TOO_LONG', limit: 100 } }); }) });
const settingsBody = z.object({ personalizationEnabled: z.boolean() }).strict();
export function recommendationRoutes(service: RecommendationService): Router {
  const router = Router();
  router.get('/home', async (req, res) => { const { limit } = parseOrThrow(homeQuery, req.query); res.json({ data: await service.home(limit, req.auth?.userId) }); });
  router.get('/suggestions', rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: false, legacyHeaders: false, handler: (req, _res, next) => { const reset = (req as unknown as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime; next(new AppError('RATE_LIMITED', { headers: { 'Retry-After': String(reset ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000)) : 60) } })); } }), async (req, res) => { const { q } = parseOrThrow(suggestionQuery, req.query); res.json({ data: await service.suggestions(q) }); });
  router.get('/settings', requireAuth, async (req, res) => { res.json({ data: await service.repository.settings(req.auth!.userId) }); });
  router.put('/settings', requireAuth, async (req, res) => { const body = parseOrThrow(settingsBody, req.body); res.json({ data: await service.repository.setSettings(req.auth!.userId, body.personalizationEnabled) }); });
  router.delete('/history', requireAuth, async (req, res) => { await service.repository.clearHistory(req.auth!.userId); res.status(204).end(); });
  return router;
}
