import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MINHASH_COEFFICIENTS, fingerprintText, mulAddMod, signatureForShingles, estimate } from '../../src/modules/duplicates/minhash.js';
import { sha256File } from '../../src/modules/duplicates/duplicate.service.js';
import { TextWorkerPool } from '../../src/modules/duplicates/text-worker-pool.js';
const P = 2147483647;
const text = Array.from({ length: 100 }, (_, i) => `từ${i}`).join(' ');
describe('duplicate fingerprints', () => {
  it('compares signatures without copying and respects typed-array offsets', () => {
    const signature = signatureForShingles(['aws s3 cloud storage']);
    const backing = new Uint8Array(600);
    backing.set(signature, 40);
    expect(estimate(signature, backing.subarray(40, 552))).toBe(1);
    expect(() => estimate(signature, backing)).toThrow(RangeError);
  });
  it('streams SHA-256 independent of filename', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'dup-'));
    try { const file = path.join(dir, 'a'); for (const bytes of [Buffer.alloc(0), Buffer.from('x'), Buffer.alloc(5 * 1024 * 1024, 42)]) { await writeFile(file, bytes); expect(await sha256File(file)).toBe(createHash('sha256').update(bytes).digest('hex')); } } finally { await rm(dir, { recursive: true }); }
  });
  it('matches BigInt modulo for 10000 deterministic samples', () => {
    let state = 42;
    const next = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state % P; };
    for (let i = 0; i < 10000; i++) { const a = next(), x = next(), b = next(); expect(mulAddMod(a, x, b)).toBe(Number((BigInt(a) * BigInt(x) + BigInt(b)) % BigInt(P))); }
  });
  it('has bounded statistical error over 540 known-Jaccard pairs', () => {
    for (const target of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
      let error = 0, bias = 0;
      for (let trial = 0; trial < 60; trial++) {
        const overlap = Math.round(800 * target / (1 + target));
        const a = Array.from({ length: 400 }, (_, n) => `shared:${trial}:${n}`);
        const b = [...a.slice(0, overlap), ...Array.from({ length: 400 - overlap }, (_, n) => `other:${trial}:${n}`)];
        const delta = estimate(signatureForShingles(a), signatureForShingles(b)) - overlap / (800 - overlap);
        error += Math.abs(delta); bias += delta;
      }
      expect(error / 60).toBeLessThanOrEqual(0.045);
      expect(Math.abs(bias / 60)).toBeLessThanOrEqual(0.02);
    }
  }, 30000);
  it('is deterministic, normalized, accent preserving and marks short/partial text', () => {
    const a = fingerprintText(text), b = fingerprintText(text.toUpperCase());
    expect(a).toEqual(b); expect(a.minhash?.length).toBe(512); expect(a.shingleCount).toBe(96); expect(a.status).toBe('OK');
    expect(fingerprintText('too short').reason).toBe('INSUFFICIENT_TEXT');
    const partial = fingerprintText(Array.from({ length: 20001 }, (_, i) => `word${i}`).join(' '));
    expect(partial).toMatchObject({ status: 'PARTIAL', reason: 'WORD_LIMIT', textSha256: null });
    expect(fingerprintText(text, 'PAGE_LIMIT').textSha256).toBeNull();
    expect(fingerprintText(text.replaceAll('từ', 'tu')).textSha256).not.toBe(a.textSha256);
  });
  it('produces identical signatures in fresh processes with frozen coefficient seeds', () => {
    const script = `import {fingerprintText} from './src/modules/duplicates/minhash.ts';console.log(Buffer.from(fingerprintText(${JSON.stringify(text)}).minhash).toString('hex'))`;
    const a = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8' });
    const b = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(a.status).toBe(0); expect(b.status).toBe(0); expect(a.stdout).toBe(b.stdout); expect(a.stdout.trim()).toBe(Buffer.from(fingerprintText(text).minhash!).toString('hex'));
    expect(MINHASH_COEFFICIENTS.slice(0, 3)).toEqual([[223436767, 1260878809], [921468647, 433795178], [59659667, 1552162885]]);
  });
  it('runs isolated PDF worker under vitest and handles malformed input without throwing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'dup-worker-')); const file = path.join(dir, 'bad.pdf');
    try { await writeFile(file, '%PDF-1.7\ninvalid'); expect(await new TextWorkerPool().analyze(file, 'PDF', 20)).toMatchObject({ status: 'SKIPPED', reason: 'MALFORMED' }); } finally { await rm(dir, { recursive: true }); }
  });
});
