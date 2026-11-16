import type { PrismaClient } from '@prisma/client';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DuplicateRepository } from '../../src/modules/duplicates/duplicate.repository.js';
import { DuplicateService, type DuplicateMatchDto } from '../../src/modules/duplicates/duplicate.service.js';
import { createLogger } from '../../src/lib/logger.js';
import { TextWorkerPool } from '../../src/modules/duplicates/text-worker-pool.js';

const match: DuplicateMatchDto = { documentId: 'visible-id', title: 'visible', visibility: 'PUBLIC', ownedByYou: false, matchType: 'SIMILAR_TEXT', similarity: 116 / 128 };
describe('mandatory upload rejection threshold', () => {
  const service = new DuplicateService({} as DuplicateRepository, 'block', createLogger({ level: 'silent', instanceId: 'test' }));
  it('rejects exact, same text and above 85% matches for both incoming visibilities', () => {
    for (const visibility of ['PRIVATE', 'PUBLIC'] as const) {
      for (const matchType of ['EXACT', 'SAME_TEXT', 'SIMILAR_TEXT'] as const) {
        expect(() => service.block([{ ...match, matchType, similarity: matchType === 'SIMILAR_TEXT' ? 109 / 128 : 1 }], visibility))
          .toThrow(expect.objectContaining({ code: 'DUPLICATE_DOCUMENT', status: 409 }));
      }
    }
  });
  it('allows exactly 85%, rejects above it without rounding, and excludes other private files', () => {
    for (const visibility of ['PRIVATE', 'PUBLIC'] as const) {
      for (const similarity of [0.7, 108 / 128, 0.85]) {
        expect(() => service.block([{ ...match, similarity }], visibility)).not.toThrow();
      }
      for (const similarity of [0.850001, 109 / 128, 115 / 128, 1]) {
        expect(() => service.block([{ ...match, similarity }], visibility)).toThrow();
      }
    }
    expect(() => service.block([{ ...match, visibility: 'PRIVATE' }], 'PRIVATE')).not.toThrow();
    expect(() => service.block([{ ...match, visibility: 'PRIVATE', ownedByYou: true }], 'PRIVATE')).toThrow();
  });
  it('filters by the raw MinHash estimate and preserves precision in match responses', async () => {
    const input = Buffer.alloc(512);
    const candidate = (equal: number) => {
      const bytes = Buffer.alloc(512);
      for (let i = equal; i < 128; i++) bytes.writeUInt32BE(1, i * 4);
      return bytes;
    };
    const query = vi.fn().mockResolvedValueOnce([{ ...match, id: 'near', ownerId: 'other', minhash: candidate(89) }])
      .mockResolvedValueOnce([{ ...match, id: 'near', ownerId: 'other', minhash: candidate(90) }]);
    const repository = new DuplicateRepository({ $queryRaw: query } as unknown as PrismaClient);
    const text = { status: 'PARTIAL' as const, reason: 'WORD_LIMIT' as const, textSha256: null, shingleCount: 100, minhash: input };
    expect((await repository.textMatches(text, 'uploader')).textMatches).toEqual([]);
    expect((await repository.textMatches(text, 'uploader')).textMatches[0]?.similarity).toBe(90 / 128);
  });
  it('fails closed when the database comparison fails after text extraction', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'duplicate-rejection-'));
    const tmpPath = path.join(dir, 'file'); await writeFile(tmpPath, 'fixture');
    const worker = vi.spyOn(TextWorkerPool.prototype, 'analyze').mockResolvedValue({
      status: 'OK', reason: null, shingleCount: 100, minhash: Buffer.alloc(512), textSha256: 'a'.repeat(64),
    });
    const repository = { exact: vi.fn().mockResolvedValue([]), textMatches: vi.fn().mockRejectedValue(new Error('database unavailable')) } as unknown as DuplicateRepository;
    const guarded = new DuplicateService(repository, 'block', createLogger({ level: 'silent', instanceId: 'test' }));
    try {
      await expect(guarded.prepare({ tmpPath, fileType: 'PDF', sizeBytes: 7 }, 'uploader', 'PUBLIC'))
        .rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 });
    } finally { worker.mockRestore(); await rm(dir, { recursive: true, force: true }); }
  });
  it('fails closed instead of accepting an incompletely scanned candidate set', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'duplicate-cap-'));
    const tmpPath = path.join(dir, 'file'); await writeFile(tmpPath, 'fixture');
    const worker = vi.spyOn(TextWorkerPool.prototype, 'analyze').mockResolvedValue({
      status: 'OK', reason: null, shingleCount: 100, minhash: Buffer.alloc(512), textSha256: 'a'.repeat(64),
    });
    const repository = { exact: vi.fn().mockResolvedValue([]), textMatches: vi.fn().mockResolvedValue({ textMatches: [], candidatesScanned: 2000, candidatesTruncated: true }) } as unknown as DuplicateRepository;
    try {
      const guarded = new DuplicateService(repository, 'block', createLogger({ level: 'silent', instanceId: 'test' }));
      await expect(guarded.prepare({ tmpPath, fileType: 'PDF', sizeBytes: 7 }, 'uploader', 'PUBLIC'))
        .rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', status: 503 });
    } finally { worker.mockRestore(); await rm(dir, { recursive: true, force: true }); }
  });
});
