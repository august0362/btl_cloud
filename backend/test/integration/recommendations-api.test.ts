import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REC_EVAL } from '../fixtures/rec-eval.js';
import { cleanupTestData, createTestContext, CSRF, registerUser, resetDatabase, uploadDocument, type TestContext, type TestUser } from './context.js';
import { recommendationHomeSchema, recommendationRelatedSchema, recommendationSettingsSchema, recommendationSuggestionsSchema, expectError } from '../helpers/contract.js';

let ctx: TestContext, owner: TestUser, viewer: TestUser, other: TestUser;
let ids: string[];
const waitWrites = async (expected: number) => { await vi.waitFor(async () => expect(await ctx.prisma.documentInteraction.count()).toBe(expected), { timeout: 3000 }); };
async function seed() {
  owner = await registerUser(ctx.app, 'Owner'); viewer = await registerUser(ctx.app, 'Viewer'); other = await registerUser(ctx.app, 'Other');
  ids = [];
  for (const fixture of REC_EVAL) {
    const id = randomUUID(); ids.push(id);
    await ctx.prisma.document.create({ data: { id, ownerId: owner.id, title: fixture.title, description: fixture.description, visibility: fixture.visibility, fileType: 'PDF', mimeType: 'application/pdf', originalFilename: 'test.pdf', sizeBytes: 20, storageKey: `rec/${id}.pdf`, fileVersion: 1, createdAt: fixture.createdAt, updatedAt: fixture.createdAt, fileUpdatedAt: fixture.createdAt } });
  }
  // Keep a real deleting owner separate from other topic documents.
  await ctx.prisma.document.update({ where: { id: ids[28]! }, data: { ownerId: other.id } });
  await ctx.prisma.user.update({ where: { id: other.id }, data: { deletionStartedAt: new Date() } });
  await ctx.services.recommendations.index.refresh();
}
afterEach(async () => {
  try { await cleanupTestData(ctx); } finally { await ctx.close(); }
});
beforeEach(async () => { vi.restoreAllMocks(); ctx = await createTestContext({ LOG_LEVEL: 'info' }); await resetDatabase(ctx.prisma); await seed(); });

describe('recommendations opt-in and lifecycle', () => {
  it('defaults off, never records guest/self/private/off views, records opt-in idempotently, clear/toggle is immediate', async () => {
    let settings = await viewer.agent.get('/api/recommendations/settings');
    expect(recommendationSettingsSchema.parse(settings.body.data)).toEqual({ personalizationEnabled: false, historyItems: 0 });
    await request(ctx.app).get(`/api/documents/${ids[0]}`); await owner.agent.get(`/api/documents/${ids[0]}`); await viewer.agent.get(`/api/documents/${ids[0]}`);
    expect(await ctx.prisma.documentInteraction.count()).toBe(0);
    expect((await viewer.agent.put('/api/recommendations/settings').set(CSRF).send({ personalizationEnabled: true })).status).toBe(200);
    await owner.agent.put('/api/recommendations/settings').set(CSRF).send({ personalizationEnabled: true });
    await owner.agent.get(`/api/documents/${ids[9]}`); expect(await ctx.prisma.documentInteraction.count()).toBe(0);
    for (let i = 0; i < 10; i++) await viewer.agent.get(`/api/documents/${ids[0]}`);
    await waitWrites(1); const first = await ctx.prisma.documentInteraction.findFirstOrThrow();
    await viewer.agent.get(`/api/documents/${ids[0]}`); await vi.waitFor(async () => expect((await ctx.prisma.documentInteraction.findFirstOrThrow()).lastAt.getTime()).toBeGreaterThan(first.lastAt.getTime()));
    expect((await viewer.agent.delete('/api/recommendations/history').set(CSRF)).status).toBe(204); await waitWrites(0);
    await viewer.agent.get(`/api/documents/${ids[1]}`); await waitWrites(1);
    settings = await viewer.agent.put('/api/recommendations/settings').set(CSRF).send({ personalizationEnabled: false });
    expect(settings.body.data).toEqual({ personalizationEnabled: false, historyItems: 0 });
    await viewer.agent.get(`/api/documents/${ids[2]}`); await waitWrites(0);
  });
  it('validates auth, strict settings, CSRF, query sizes and rejects mine relevance', async () => {
    expectError(await request(ctx.app).get('/api/recommendations/settings'), 401, 'UNAUTHENTICATED');
    expect((await viewer.agent.put('/api/recommendations/settings').send({ personalizationEnabled: true })).status).toBe(403);
    expectError(await viewer.agent.put('/api/recommendations/settings').set(CSRF).send({ personalizationEnabled: true, extra: true }), 400, 'VALIDATION_ERROR');
    expectError(await request(ctx.app).get('/api/recommendations/home?limit=21'), 400, 'VALIDATION_ERROR');
    expectError(await request(ctx.app).get(`/api/documents/${ids[0]}/related?limit=13`), 400, 'VALIDATION_ERROR');
    const error = expectError(await request(ctx.app).get(`/api/recommendations/suggestions?q=${'x'.repeat(101)}`), 400, 'VALIDATION_ERROR'); expect(error[0]!.issue).toBe('TOO_LONG');
    const mine = expectError(await viewer.agent.get('/api/documents/mine?sort=relevance'), 400, 'VALIDATION_ERROR'); expect(mine[0]!.issue).toBe('INVALID_ENUM');
    expect((await viewer.agent.get('/api/documents?sort=relevance')).status).toBe(200);
  });
  it('successful download records DOWNLOAD only for opt-in, own download does not', async () => {
    const doc = await uploadDocument(owner, { title: 'Real AWS document' });
    await viewer.agent.get(`/api/documents/${doc.id}/download`); expect(await ctx.prisma.documentInteraction.count()).toBe(0);
    await viewer.agent.put('/api/recommendations/settings').set(CSRF).send({ personalizationEnabled: true });
    expect((await viewer.agent.get(`/api/documents/${doc.id}/download`)).status).toBe(200); await waitWrites(1);
    expect((await ctx.prisma.documentInteraction.findFirstOrThrow()).kind).toBe('DOWNLOAD');
    await owner.agent.get(`/api/documents/${doc.id}/download`); await waitWrites(1);
  });
  it('purges only expired interactions and cascades document deletion', async () => {
    await ctx.prisma.documentInteraction.createMany({ data: [91, 89].map((days, i) => ({ userId: viewer.id, documentId: ids[i]!, kind: 'VIEW', firstAt: new Date(Date.now() - days * 86400000), lastAt: new Date(Date.now() - days * 86400000) })) });
    await ctx.services.recommendations.purge(); expect(await ctx.prisma.documentInteraction.count()).toBe(1);
    await ctx.prisma.document.delete({ where: { id: ids[1]! } }); expect(await ctx.prisma.documentInteraction.count()).toBe(0);
  });
});

describe('recommendations retrieval and privacy', () => {
  it('cold start newest is deterministic and excludes own/deleting/private documents', async () => {
    const hydrated = await ctx.services.documents.findDiscoverableByIds([ids[0]!]);
    expect(typeof hydrated[0]!.sizeBytes).toBe('number'); expect(typeof hydrated[0]!.fileVersion).toBe('number');
    const response = await request(ctx.app).get('/api/recommendations/home?limit=20');
    const home = recommendationHomeSchema.parse(response.body.data); expect(home.strategy).toBe('NEWEST');
    const docs = home.items.map((item) => item.document); expect(docs.every((doc) => doc.visibility === 'PUBLIC')).toBe(true);
    expect(docs.map((doc) => doc.id)).not.toContain(ids[28]);
    expect(docs.map((doc) => doc.createdAt)).toEqual(docs.map((doc) => doc.createdAt).toSorted().reverse());
    expect((await owner.agent.get('/api/recommendations/home')).body.data.items).toHaveLength(0);
  });
  it('personalized AI and AWS profiles differ, exclude all90-day history even beyond50, query wins preferences', async () => {
    const awsViewer = await registerUser(ctx.app, 'AWS viewer');
    for (const user of [viewer, awsViewer]) await ctx.prisma.user.update({ where: { id: user.id }, data: { personalizationEnabled: true } });
    for (const [user, start] of [[viewer, 10], [awsViewer, 0]] as const) {
      for (let i = start; i < start + 3; i++) await ctx.prisma.documentInteraction.create({ data: { userId: user.id, documentId: ids[i]!, kind: 'VIEW', firstAt: new Date(), lastAt: new Date() } });
      await ctx.prisma.documentInteraction.create({ data: { userId: user.id, documentId: ids[start]!, kind: 'DOWNLOAD', firstAt: new Date(), lastAt: new Date() } });
    }
    await ctx.services.recommendations.index.refresh();
    const ai = (await viewer.agent.get('/api/recommendations/home?limit=4')).body.data;
    const aws = (await awsViewer.agent.get('/api/recommendations/home?limit=4')).body.data;
    expect(ai.strategy).toBe('PERSONALIZED'); expect(ai.items.filter((item: { document: { title: string } }) => item.document.title.startsWith('AI')).length).toBeGreaterThanOrEqual(3);
    expect(ai.items.map((item: { document: { id: string } }) => item.document.id).filter((id: string) => aws.items.some((item: { document: { id: string } }) => item.document.id === id)).length).toBeLessThanOrEqual(1);
    expect(ai.items.map((item: { document: { id: string } }) => item.document.id)).not.toContain(ids[10]);
    await ctx.prisma.document.update({ where: { id: ids[25]! }, data: { description: 'AWS' } });
    const search = (await viewer.agent.get('/api/documents?q=AWS&sort=relevance&pageSize=50')).body.data.items;
    expect(search.at(-1).id).toBe(ids[25]);
  });
  it('excludes history older than the50-row preference window and keeps home query budget', async () => {
    await ctx.prisma.user.update({ where: { id: viewer.id }, data: { personalizationEnabled: true } });
    const moreIds = Array.from({ length: 55 }, () => randomUUID());
    await ctx.prisma.document.createMany({ data: moreIds.map((id) => ({ id, ownerId: owner.id, title: 'AWS Cloud recent history', description: 'AWS S3 EC2', visibility: 'PUBLIC', fileType: 'PDF', mimeType: 'application/pdf', originalFilename: 'a.pdf', sizeBytes: 1, storageKey: `rec/${id}`, createdAt: new Date(), updatedAt: new Date(), fileUpdatedAt: new Date() })) });
    await ctx.prisma.documentInteraction.createMany({ data: moreIds.map((documentId) => ({ userId: viewer.id, documentId, kind: 'VIEW', firstAt: new Date(), lastAt: new Date() })) });
    await ctx.prisma.documentInteraction.create({ data: { userId: viewer.id, documentId: ids[0]!, kind: 'VIEW', firstAt: new Date(2026, 0, 1), lastAt: new Date(Date.now() - 10 * 86400000) } });
    await ctx.services.recommendations.index.refresh();
    const finalQuery = vi.spyOn(ctx.prisma, '$queryRaw');
    const historyQueries = vi.spyOn(ctx.prisma.documentInteraction, 'findMany');
    const response = await viewer.agent.get('/api/recommendations/home?limit=20');
    expect(response.body.data.strategy).toBe('PERSONALIZED');
    const returnedIds = response.body.data.items.map((item: { document: { id: string } }) => item.document.id);
    for (const id of [...moreIds, ids[0]!]) expect(returnedIds).not.toContain(id);
    expect(finalQuery).toHaveBeenCalledTimes(1); expect(historyQueries).toHaveBeenCalledTimes(2);
  });
  it('popular counts unique rows, related threshold and source exclusion, settings-off coldstart', async () => {
    await ctx.prisma.user.update({ where: { id: viewer.id }, data: { personalizationEnabled: true } });
    await ctx.prisma.documentInteraction.create({ data: { userId: viewer.id, documentId: ids[0]!, kind: 'DOWNLOAD', firstAt: new Date(), lastAt: new Date() } });
    await ctx.services.recommendations.index.refresh();
    const guest = recommendationHomeSchema.parse((await request(ctx.app).get('/api/recommendations/home')).body.data); expect(guest.strategy).toBe('POPULAR'); expect(guest.items[0]!.document.id).toBe(ids[0]);
    const related = recommendationRelatedSchema.parse((await request(ctx.app).get(`/api/documents/${ids[0]}/related?limit=3`)).body.data);
    expect(related.items).toHaveLength(3); expect(related.items.every((doc) => doc.title.startsWith('AWS') && doc.id !== ids[0])).toBe(true);
    expect((await owner.agent.get(`/api/documents/${ids[9]}/related`)).status).toBe(200);
    expect((await viewer.agent.get(`/api/documents/${ids[9]}/related`)).status).toBe(404);
  });
  it('rechecks stale cached results for Private, deleted and DELETING owners on all surfaces and profile', async () => {
    await ctx.prisma.user.update({ where: { id: viewer.id }, data: { personalizationEnabled: true } });
    await ctx.prisma.documentInteraction.create({ data: { userId: viewer.id, documentId: ids[0]!, kind: 'VIEW', firstAt: new Date(), lastAt: new Date() } });
    await ctx.prisma.document.update({ where: { id: ids[0]! }, data: { visibility: 'PRIVATE' } });
    await ctx.prisma.document.delete({ where: { id: ids[1]! } });
    const home = (await viewer.agent.get('/api/recommendations/home?limit=20')).body.data;
    expect(home.strategy).not.toBe('PERSONALIZED');
    const related = (await request(ctx.app).get(`/api/documents/${ids[2]}/related?limit=12`)).body.data;
    const suggestions = recommendationSuggestionsSchema.parse((await request(ctx.app).get('/api/recommendations/suggestions?q=AWS')).body.data);
    for (const id of ids.slice(0, 2)) { expect(home.items.map((item: { document: { id: string } }) => item.document.id)).not.toContain(id); expect(related.items.map((item: { id: string }) => item.id)).not.toContain(id); expect(suggestions.items.map((item) => item.documentId)).not.toContain(id); }
    await ctx.prisma.user.update({ where: { id: owner.id }, data: { deletionStartedAt: new Date() } });
    expect((await request(ctx.app).get('/api/recommendations/home')).body.data.items).toEqual([]);
    expect((await request(ctx.app).get('/api/recommendations/suggestions?q=AWS')).body.data.items).toEqual([]);
  });
  it('suggestions short-circuit DB, deduplicate titles, rate-limit61 and redact q', async () => {
    const query = vi.spyOn(ctx.prisma, '$queryRaw');
    expect((await request(ctx.app).get('/api/recommendations/suggestions?q=A')).body.data.items).toEqual([]); expect(query).not.toHaveBeenCalled();
    await ctx.prisma.document.update({ where: { id: ids[1]! }, data: { title: REC_EVAL[0]!.title } }); await ctx.services.recommendations.index.refresh(); query.mockClear();
    const response = await request(ctx.app).get('/api/recommendations/suggestions?q=AWS');
    const items = recommendationSuggestionsSchema.parse(response.body.data).items;
    expect(new Set(items.map((item) => item.title.toLowerCase())).size).toBe(items.length); expect(items.length).toBeLessThanOrEqual(8); expect(query).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 58; i++) expect((await request(ctx.app).get('/api/recommendations/suggestions?q=AWS')).status).toBe(200);
    const limited = await request(ctx.app).get('/api/recommendations/suggestions?q=AWS'); expectError(limited, 429, 'RATE_LIMITED'); expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(ctx.logs.join('')).not.toContain('q=AWS');
  });
  it('ranking/index faults fall back safely; disabled mode never records', async () => {
    const original = ctx.services.recommendations.index.get.bind(ctx.services.recommendations.index);
    vi.spyOn(ctx.services.recommendations.index, 'get').mockImplementation(() => { throw new Error('fault'); });
    expect((await request(ctx.app).get('/api/recommendations/home')).body.data.strategy).toBe('NEWEST');
    expect((await request(ctx.app).get(`/api/documents/${ids[0]}/related`)).body.data.items).toEqual([]);
    expect((await request(ctx.app).get('/api/recommendations/suggestions?q=AWS')).body.data.items).toEqual([]);
    const raw = await ctx.services.documents.searchRelevanceOrdered({ q: 'AWS', offset: 0, limit: 12 });
    expect((await request(ctx.app).get('/api/documents?q=AWS&sort=relevance')).body.data.items.map((doc: { id: string }) => doc.id)).toEqual(raw.rows.map((doc) => doc.id));
    expect(ctx.logs.join('')).toContain('recommendations.fallback'); vi.mocked(ctx.services.recommendations.index.get).mockImplementation(original);
    const disabled = await createTestContext({ RECOMMENDATIONS_ENABLED: 'false' });
    try {
      await ctx.prisma.user.update({ where: { id: viewer.id }, data: { personalizationEnabled: true } });
      const agent = request.agent(disabled.app); await agent.post('/api/auth/login').set(CSRF).send({ email: viewer.email, password: 'matkhau123' });
      await agent.get(`/api/documents/${ids[0]}`); expect(await ctx.prisma.documentInteraction.count()).toBe(0);
      expect((await agent.get('/api/recommendations/home')).body.data.strategy).toBe('NEWEST');
      expect((await agent.get(`/api/documents/${ids[0]}/related`)).body.data.items).toEqual([]);
      expect((await agent.get('/api/recommendations/suggestions?q=AWS')).body.data.items).toEqual([]);
    } finally { await disabled.close(); }
  });
  it('230 search results page across200 without duplicates or missing rows, title matches globally precede description', async () => {
    await ctx.prisma.document.deleteMany();
    const expected = [];
    for (let i = 0; i < 230; i++) {
      const id = randomUUID(); expected.push(id);
      await ctx.prisma.document.create({ data: { id, ownerId: owner.id, title: i < 205 ? `AWS title ${i}` : `Description ${i}`, description: 'AWS', visibility: 'PUBLIC', fileType: 'PDF', mimeType: 'application/pdf', originalFilename: 'a.pdf', sizeBytes: 1, storageKey: `rec/${id}`, createdAt: new Date(i), updatedAt: new Date(i), fileUpdatedAt: new Date(i) } });
    }
    await ctx.services.recommendations.index.refresh();
    const all: { id: string; title: string }[] = [];
    for (let page = 1; page <= 5; page++) {
      const response = await request(ctx.app).get(`/api/documents?q=AWS&sort=relevance&pageSize=50&page=${page}`);
      expect(response.status).toBe(200); expect(response.body.data.totalItems).toBe(230); all.push(...response.body.data.items);
    }
    expect(new Set(all.map((doc) => doc.id)).size).toBe(230); expect(all.map((doc) => doc.id).toSorted()).toEqual(expected.toSorted());
    expect(all.slice(0, 205).every((doc) => doc.title.startsWith('AWS'))).toBe(true); expect(all.slice(205).every((doc) => doc.title.startsWith('Description'))).toBe(true);
    const again = await request(ctx.app).get('/api/documents?q=AWS&sort=relevance&pageSize=50&page=4'); expect(again.body.data.items.map((doc: { id: string }) => doc.id)).toEqual(all.slice(150, 200).map((doc) => doc.id));
    const smallPages: string[] = [];
    for (let page = 1; page <= 46; page++) { const result = await request(ctx.app).get(`/api/documents?q=AWS&sort=relevance&pageSize=5&page=${page}`); expect(result.status).toBe(200); smallPages.push(...result.body.data.items.map((doc: { id: string }) => doc.id)); }
    expect(smallPages).toEqual(all.map((doc) => doc.id));
  });
});
