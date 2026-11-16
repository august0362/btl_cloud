import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { trackInteraction } from '../../src/modules/recommendations/interaction.middleware.js';
import type { RecommendationService } from '../../src/modules/recommendations/recommendations.service.js';

describe('recommendation interaction lifecycle', () => {
  it.each(['close', 'failed', 'aborted', 'guest', 'self', 'private', 'disabled'])('does not record %s', (scenario) => {
    const service = { isEnabled: scenario !== 'disabled', repository: { record: vi.fn().mockResolvedValue(undefined) }, now: () => new Date(), writeFailed: vi.fn() };
    const req = { auth: scenario === 'guest' ? null : { userId: 'viewer' } };
    const res = Object.assign(new EventEmitter(), { locals: { document: { id: 'doc', ownerId: scenario === 'self' ? 'viewer' : 'owner', visibility: scenario === 'private' ? 'PRIVATE' : 'PUBLIC' } }, writableFinished: scenario !== 'aborted', statusCode: scenario === 'failed' ? 500 : 200 });
    const next = vi.fn(); trackInteraction(service as unknown as RecommendationService, 'DOWNLOAD')(req as Request, res as unknown as Response, next);
    res.emit(scenario === 'close' ? 'close' : 'finish'); expect(service.repository.record).not.toHaveBeenCalled(); expect(next).toHaveBeenCalledOnce();
  });
  it('fires write without waiting and isolates failure without target details', async () => {
    const service = { isEnabled: true, repository: { record: vi.fn().mockRejectedValue(new Error('db')) }, now: () => new Date(0), writeFailed: vi.fn() };
    const res = Object.assign(new EventEmitter(), { locals: { document: { id: 'doc', ownerId: 'owner', visibility: 'PUBLIC' } }, writableFinished: true, statusCode: 200 });
    trackInteraction(service as unknown as RecommendationService, 'VIEW')({ auth: { userId: 'viewer' } } as Request, res as unknown as Response, vi.fn());
    res.emit('finish'); expect(service.repository.record).toHaveBeenCalledWith('viewer', 'doc', 'VIEW', new Date(0)); await Promise.resolve(); expect(service.writeFailed).toHaveBeenCalledOnce();
  });
});
