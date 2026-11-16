import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import request from 'supertest';
import { expect, it } from 'vitest';
import { buildIndex } from '../../src/modules/recommendations/recommendations.index.js';
import { createTestContext, registerUser, resetDatabase } from './context.js';

it.skipIf(process.env.REC_BENCHMARK !== '1')('BENCH-B1/B2: local index and10 concurrent requests/30s per surface', async () => {
  await mkdir('tmp', { recursive: true });
  const output = 'tmp/recommendations-benchmark.jsonl';
  await writeFile(output, '');
  const measure = async (kind: string, value: object) => { const row = { kind, measuredAt: new Date().toISOString(), ...value }; await appendFile(output, `${JSON.stringify(row)}\n`); console.log(row); };
  const descriptionFor = (document: number) => Array.from({ length: 400 }, (_, i) => `term${(i * i + document * 17) % 8000}`).join(' ').slice(0, 2000);
  for (const count of [1000, 5000]) {
    const loop = monitorEventLoopDelay({ resolution: 1 }); loop.enable();
    const rows = Array.from({ length: count }, (_, i) => ({ id: String(i), ownerId: 'o', title: `AWS S3 Cloud ${i % 10}`, description: descriptionFor(i), createdAt: new Date(i) }));
    global.gc?.();
    const before = process.memoryUsage().heapUsed, started = performance.now();
    const index = await buildIndex(rows, new Map(), Date.now());
    const durationMs = performance.now() - started;
    await new Promise((resolve) => setTimeout(resolve, 5)); loop.disable();
    global.gc?.();
    const heapMB = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
    await measure('BENCH-B1', { count, durationMs, heapMB, terms: index.vocabulary.size, eventLoopP99Ms: loop.percentile(99) / 1e6, node: process.version, platform: process.platform, descriptionCharacters: 2000 });
    expect(index.documents).toHaveLength(count); expect(durationMs).toBeLessThan(2000); expect(heapMB).toBeLessThan(64); expect(loop.percentile(99) / 1e6).toBeLessThan(50);
  }
  const ctx = await createTestContext();
  try {
    await resetDatabase(ctx.prisma); const owner = await registerUser(ctx.app);
    const ids = Array.from({ length: 5000 }, () => randomUUID());
    for (let batch = 0; batch < ids.length; batch += 250) await ctx.prisma.document.createMany({ data: ids.slice(batch, batch + 250).map((id, i) => ({ id, ownerId: owner.id, title: `AWS S3 Cloud ${batch + i}`, description: descriptionFor(batch + i), visibility: 'PUBLIC', fileType: 'PDF', mimeType: 'application/pdf', originalFilename: 'a.pdf', sizeBytes: 1, storageKey: `benchmark/${id}`, createdAt: new Date(batch + i), updatedAt: new Date(), fileUpdatedAt: new Date() })) });
    await ctx.services.recommendations.index.refresh();
    const percentiles: Record<string, number> = {};
    for (const [surface, route] of [['home', '/api/recommendations/home'], ['related', `/api/documents/${ids[0]}/related`], ['suggestions', '/api/recommendations/suggestions?q=AWS'], ['relevance', '/api/documents?q=AWS&sort=relevance'], ['newest', '/api/documents?q=AWS&sort=newest']]) {
      const times: number[] = [], deadline = performance.now() + 30000;
      // Pace suggestions to50 actual HTTP requests in30s, preserving the60/min/IP limiter.
      const smoke = await request(ctx.app).get(route!); expect(smoke.status).toBe(200);
      await Promise.all(Array.from({ length: 10 }, async () => {
        while (performance.now() < deadline) {
          const start = performance.now();
          expect((await request(ctx.app).get(route!)).status).toBe(200);
          times.push(performance.now() - start);
          if (surface === 'suggestions') await new Promise((resolve) => setTimeout(resolve, 6000));
        }
      }));
      times.sort((a, b) => a - b); const p95 = times[Math.floor(times.length * 0.95)]!; percentiles[surface!] = p95;
      await measure('BENCH-B2', { surface, concurrency: 10, durationSeconds: 30, requests: times.length, p95Ms: p95, suggestionsPaced: surface === 'suggestions' });
    }
    expect(percentiles.home).toBeLessThanOrEqual(300); expect(percentiles.related).toBeLessThanOrEqual(200); expect(percentiles.suggestions).toBeLessThanOrEqual(100); expect(percentiles.relevance! - percentiles.newest!).toBeLessThanOrEqual(100);
  } finally { await ctx.close(); }
}, 240000);
