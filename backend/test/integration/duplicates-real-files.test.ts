import { readFile } from 'node:fs/promises';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { createServices } from '../../src/container.js';
import { createLogger } from '../../src/lib/logger.js';
import { sha256 } from '../helpers/fixtures.js';
import { TEST_ENV } from '../helpers/config.js';
import {
  binaryParser, cleanupTestData, createTestContext, CSRF, readObject, registerUser, resetDatabase, uploadRequest,
  type TestContext, type TestUser,
} from './context.js';

const formats = [
  { extension: 'docx', type: 'DOCX', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { extension: 'pdf', type: 'PDF', mime: 'application/pdf' },
  { extension: 'pptx', type: 'PPTX', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
] as const;
type Format = typeof formats[number];
type Variant = 'original' | 'same-text' | 'high' | 'above-85' | 'warning' | 'different';
const fixture = (format: Format, variant: Variant) => readFile(new URL(`../fixtures/duplicate-documents/${variant}.${format.extension}`, import.meta.url));
let ctx: TestContext;
let owner: TestUser;
let other: TestUser;

beforeAll(async () => {
  ctx = await createTestContext();
  // Exercise the deployed configuration, without the legacy fixture mode override.
  const config = loadConfig({
    NODE_ENV: 'test', ...TEST_ENV, LOG_LEVEL: 'silent', AUTH_RATE_LIMIT_MAX: '1000',
    UPLOAD_TMP_DIR: ctx.config.upload.tmpDir,
  });
  const logger = createLogger({ level: 'silent', instanceId: 'real-files-test' });
  const deps = { config, logger, prisma: ctx.prisma, storage: ctx.storage };
  ctx.app = createApp({ ...deps, services: createServices(deps) });
  expect(config.duplicates.mode).toBe('block');
});
beforeEach(async () => {
  await resetDatabase(ctx.prisma);
  ctx.storage.reset();
  owner = await registerUser(ctx.app);
  other = await registerUser(ctx.app);
});
afterEach(async () => { await cleanupTestData(ctx); });
afterAll(async () => { await ctx.close(); });

async function upload(user: TestUser, format: Format, variant: Variant, visibility: 'PUBLIC' | 'PRIVATE' = 'PUBLIC') {
  return uploadRequest(user, {
    title: `${format.type} ${variant}`, visibility, file: await fixture(format, variant),
    filename: `${variant}.${format.extension}`, contentType: format.mime,
  });
}
async function original(format: Format) {
  const response = await upload(owner, format, 'original');
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  expect(response.body.data.fileType).toBe(format.type);
  expect(response.body.data.duplicateCheck.textAnalysis).toMatchObject({ status: 'OK', reason: null });
  return response.body.data.id as string;
}
async function onlyOriginalStored() {
  expect(await ctx.prisma.document.count()).toBe(1);
  expect(await ctx.prisma.documentFingerprint.count()).toBe(1);
  expect(ctx.storage.putKeys).toHaveLength(1);
}

describe.each(formats)('$type real document uploads', (format) => {
  it('rejects a downloaded public file at 100% despite a new filename, title, account or visibility', async () => {
    const id = await original(format);
    const downloaded = await other.agent.get(`/api/documents/${id}/download`).buffer(true).parse(binaryParser);
    expect(downloaded.status).toBe(200);
    expect(downloaded.body).toEqual(await fixture(format, 'original'));
    for (const visibility of ['PUBLIC', 'PRIVATE'] as const) {
      const rejected = await uploadRequest(other, {
        title: 'Renamed downloaded document', visibility, file: downloaded.body,
        filename: `downloaded-copy.${format.extension}`, contentType: format.mime,
      });
      expect(rejected.status, JSON.stringify(rejected.body)).toBe(409);
      expect(rejected.body.error.code).toBe('DUPLICATE_DOCUMENT');
      expect(rejected.body.error.duplicates).toEqual([
        expect.objectContaining({ documentId: id, matchType: 'EXACT', similarity: 1, ownedByYou: false }),
      ]);
    }
    await onlyOriginalStored();
  });

  it('rejects identical extracted text at 100% when the actual file bytes differ', async () => {
    const id = await original(format);
    expect(sha256(await fixture(format, 'same-text'))).not.toBe(sha256(await fixture(format, 'original')));
    for (const visibility of ['PUBLIC', 'PRIVATE'] as const) {
      const rejected = await upload(other, format, 'same-text', visibility);
      expect(rejected.status, JSON.stringify(rejected.body)).toBe(409);
      expect(rejected.body.error.duplicates).toEqual([
        expect.objectContaining({ documentId: id, matchType: 'SAME_TEXT', similarity: 1 }),
      ]);
    }
    await onlyOriginalStored();
  });

  it.each(['high', 'above-85'] as const)('rejects %s text above 85% before writing to S3 or MySQL', async (variant) => {
    const id = await original(format);
    for (const visibility of ['PUBLIC', 'PRIVATE'] as const) {
      const rejected = await upload(other, format, variant, visibility);
      expect(rejected.status, JSON.stringify(rejected.body)).toBe(409);
      const match = rejected.body.error.duplicates.find((item: { documentId: string }) => item.documentId === id);
      expect(match).toMatchObject({ matchType: 'SIMILAR_TEXT' });
      expect(match.similarity).toBeGreaterThan(0.85);
      expect(match.similarity).toBeLessThan(1);
      if (variant === 'above-85') expect(match.similarity).toBe(109 / 128);
    }
    await onlyOriginalStored();
  });

  it('accepts 70-85% text with a numeric warning and stores the accepted file', async () => {
    const id = await original(format);
    const accepted = await upload(other, format, 'warning', 'PRIVATE');
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
    const check = accepted.body.data.duplicateCheck;
    expect(check.result).toBe('WARNING');
    expect(check.textAnalysis).toMatchObject({ status: 'OK', reason: null });
    expect(check.exactMatches).toEqual([]);
    expect(check.textMatches).toHaveLength(1);
    expect(check.textMatches[0]).toMatchObject({ documentId: id, matchType: 'SIMILAR_TEXT' });
    expect(check.textMatches[0].similarity).toBeGreaterThanOrEqual(0.7);
    expect(check.textMatches[0].similarity).toBeLessThanOrEqual(0.85);
    expect(await ctx.prisma.document.count()).toBe(2);
    expect(await ctx.prisma.documentFingerprint.count()).toBe(2);
    expect(ctx.storage.putKeys).toHaveLength(2);
    expect(await readObject(ctx.s3, ctx.storage.putKeys[1]!)).toEqual(await fixture(format, 'warning'));
  });

  it('accepts text below 70% without a duplicate warning', async () => {
    await original(format);
    const accepted = await upload(other, format, 'different');
    expect(accepted.status, JSON.stringify(accepted.body)).toBe(201);
    expect(accepted.body.data.duplicateCheck).toMatchObject({ result: 'ACCEPT', textMatches: [], exactMatches: [] });
    expect(accepted.body.data.duplicateCheck.textAnalysis.status).toBe('OK');
    expect(await ctx.prisma.document.count()).toBe(2);
  });

  it('preserves the old file on a rejected replacement, then allows a warning-level replacement', async () => {
    const sourceId = await original(format);
    const target = await upload(other, format, 'different', 'PRIVATE');
    expect(target.status, JSON.stringify(target.body)).toBe(201);
    const id = target.body.data.id as string;
    const before = await ctx.prisma.document.findUniqueOrThrow({ where: { id } });
    const fingerprintBefore = await ctx.prisma.documentFingerprint.findUniqueOrThrow({ where: { documentId: id } });
    const replace = async (variant: Variant) => other.agent.put(`/api/documents/${id}/file`).set(CSRF)
      .attach('file', await fixture(format, variant), { filename: `${variant}.${format.extension}`, contentType: format.mime });
    const denied = await replace('above-85');
    expect(denied.status, JSON.stringify(denied.body)).toBe(409);
    expect(denied.body.error.duplicates[0]).toMatchObject({ documentId: sourceId, similarity: 109 / 128 });
    expect(await ctx.prisma.document.findUniqueOrThrow({ where: { id } })).toEqual(before);
    expect(await ctx.prisma.documentFingerprint.findUniqueOrThrow({ where: { documentId: id } })).toEqual(fingerprintBefore);
    expect(ctx.storage.putKeys).toHaveLength(2);
    expect(await readObject(ctx.s3, before.storageKey)).toEqual(await fixture(format, 'different'));

    const allowed = await replace('warning');
    expect(allowed.status, JSON.stringify(allowed.body)).toBe(200);
    expect(allowed.body.data.duplicateCheck.result).toBe('WARNING');
    const current = await ctx.prisma.document.findUniqueOrThrow({ where: { id } });
    expect(current.fileVersion).toBe(before.fileVersion + 1);
    expect(current.storageKey).not.toBe(before.storageKey);
    expect(await readObject(ctx.s3, current.storageKey)).toEqual(await fixture(format, 'warning'));
    await expect(ctx.s3.getObject(before.storageKey)).rejects.toMatchObject({ kind: 'NOT_FOUND' });
    expect(await ctx.prisma.documentFingerprint.findUniqueOrThrow({ where: { documentId: id } })).toMatchObject({
      fileVersion: current.fileVersion, sha256: sha256(await fixture(format, 'warning')),
    });
    expect(await ctx.prisma.document.count()).toBe(2);
  });
});

it.each([
  { source: formats[0], copy: formats[1] },
  { source: formats[1], copy: formats[2] },
  { source: formats[2], copy: formats[0] },
])(
  'rejects the same text across formats: $source.type to $copy.type', async ({ source, copy }) => {
    const id = await original(source);
    const rejected = await upload(other, copy, 'original', 'PRIVATE');
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(409);
    expect(rejected.body.error.duplicates).toEqual([
      expect.objectContaining({ documentId: id, matchType: 'SAME_TEXT', similarity: 1 }),
    ]);
    await onlyOriginalStored();
  },
);
