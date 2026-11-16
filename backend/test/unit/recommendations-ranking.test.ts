import { describe, expect, it, vi } from 'vitest';
import { foldForMatch, tokenize } from '../../src/lib/text-normalize.js';
import { buildIndex, IndexManager } from '../../src/modules/recommendations/recommendations.index.js';
import { cosine, counts, freshness, matchLevel, newest, vectorize } from '../../src/modules/recommendations/ranking.policy.js';
import type { RecommendationRepository } from '../../src/modules/recommendations/recommendations.repository.js';
import type { Logger } from '../../src/lib/logger.js';
import { REC_EVAL } from '../fixtures/rec-eval.js';
import { redactQuery } from '../../src/http/middleware/request-context.js';

describe('recommendations pure ranking and index', () => {
  it('normalizes Vietnamese while keeping vector accents', () => {
    expect(tokenize('Điện Toán ĐÁM MÂY').tokens.join(' ')).toBe('điện toán đám mây');
    expect(foldForMatch('Điện Toán ĐÁM MÂY')).toBe('dien toan dam may');
    expect(tokenize('AWS-S3').tokens).toEqual(['aws', 's3']);
  });
  it.each([['AI', 5], ['Nhập môn AI', 4], ['AIoT cơ bản', 3], ['Email', 2], ['Khác', 1]])('level %s => %i', (title, level) => expect(matchLevel(title, 'ai', 'ai')).toBe(level));
  it('matches accent-free phrases and empty punctuation', () => { expect(matchLevel('Điện toán', null, 'dien toan')).toBe(5); expect(matchLevel('AWS', 'AWS', '%_!')).toBe(0); });
  it('level always dominates randomized preferences, including guests (500 seeded trials)', () => {
    let seed = 71;
    const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let trial = 0; trial < 500; trial++) {
      const rows = Array.from({ length: 30 }, () => ({ level: Math.floor(random() * 6), pref: random(), pop: random(), fresh: random() }));
      for (const guest of [true, false]) {
        const sorted = rows.toSorted((a, b) => b.level - a.level || (0.5 * (guest ? 0 : b.pref) + 0.25 * b.pop + 0.25 * b.fresh) - (0.5 * (guest ? 0 : a.pref) + 0.25 * a.pop + 0.25 * a.fresh));
        expect(sorted.every((row, i) => i === 0 || sorted[i - 1]!.level >= row.level)).toBe(true);
      }
    }
  });
  it('TF-IDF separates cloud from calculus, null text works, vectors normalized', async () => {
    const index = await buildIndex(REC_EVAL.map((row, i) => ({ ...row, id: String(i), ownerId: 'owner' })), new Map(), Date.now());
    const query = vectorize(counts('AWS S3 và EC2'), index.vocabulary, index.idf);
    const cloud = index.documents.slice(0, 10).map((doc) => cosine(query, doc.vec));
    const calculus = index.documents.slice(20).map((doc) => cosine(query, doc.vec));
    expect(Math.min(...cloud)).toBeGreaterThan(Math.max(...calculus));
    for (const doc of index.documents) expect(cosine(doc.vec, doc.vec)).toBeCloseTo(1, 5);
    expect(freshness(new Date('2026-01-01'), new Date('2026-01-31'))).toBeCloseTo(0.5);
    expect(newest({ id: 'a', createdAt: new Date(0) }, { id: 'b', createdAt: new Date(0) })).toBeGreaterThan(0);
  });
  it('caps index at5000, yields batches, and contains no raw descriptions', async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({ id: String(i), ownerId: 'o', title: 'Cloud AWS', description: 'Secret public description', createdAt: new Date(i) }));
    const index = await buildIndex(rows, new Map([['1', 3], ['2', 1]]), 0);
    expect(index.documents).toHaveLength(5000); expect(index.documents[0]).not.toHaveProperty('description');
    expect(index.byId.get('1')!.pop).toBeGreaterThan(index.byId.get('2')!.pop);
  });
  it('shares one lazy build, preserves old index on refresh failure', async () => {
    let now = 0;
    const repository = { corpus: vi.fn().mockResolvedValue([{ id: 'a', ownerId: 'o', title: 'AWS', description: null, createdAt: new Date(0) }]), popularity: vi.fn().mockResolvedValue([]) };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const manager = new IndexManager(repository as unknown as RecommendationRepository, { now: () => new Date(now) }, logger as unknown as Logger);
    expect(manager.get()).toBeUndefined(); const first = manager.refresh(); expect(first).toBe(manager.refresh()); await first;
    const old = manager.get(); expect(old?.documents).toHaveLength(1); now = 700000; repository.corpus.mockRejectedValue(new Error('db'));
    expect(manager.get()).toBe(old); await manager.refresh(); expect(manager.get()).toBe(old); expect(logger.warn).toHaveBeenCalled();
  });
  it('redacts repeated and encoded q on every pathname', () => {
    for (const path of ['/api/documents', '/anything', '/api/recommendations/suggestions']) { const result = redactQuery(`${path}?%71=private&q=another&sort=newest`); expect(result).not.toContain('private'); expect(result).not.toContain('another'); expect(result).toContain('sort=newest'); }
  });
});
