import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPersonalizationScenario } from '../fixtures/personalization-scenario.js';
import { binaryParser, CSRF, registerUser, type TestUser } from './context.js';
import { recommendationHomeSchema, recommendationSettingsSchema } from '../helpers/contract.js';

let scenario: Awaited<ReturnType<typeof createPersonalizationScenario>>;
let cloud: TestUser;
let ai: TestUser;
beforeEach(async () => {
  scenario = await createPersonalizationScenario();
  cloud = await registerUser(scenario.ctx.app, 'Cloud reader');
  ai = await registerUser(scenario.ctx.app, 'AI reader');
});
afterEach(async () => { await scenario.close(); });
const settings = async (user: TestUser) => {
  const response = await user.agent.get('/api/recommendations/settings');
  expect(response.status).toBe(200);
  return recommendationSettingsSchema.parse(response.body.data);
};
const enable = async (user: TestUser, enabled = true) => {
  const response = await user.agent.put('/api/recommendations/settings').set(CSRF).send({ personalizationEnabled: enabled });
  expect(response.status).toBe(200);
  return recommendationSettingsSchema.parse(response.body.data);
};
const home = async (user: TestUser) => {
  const response = await user.agent.get('/api/recommendations/home?limit=4');
  expect(response.status).toBe(200);
  return recommendationHomeSchema.parse(response.body.data);
};
async function view(user: TestUser, index: number) {
  const response = await user.agent.get(`/api/documents/${scenario.ids[index]}`);
  expect(response.status).toBe(200);
}
async function download(user: TestUser, index: number) {
  const response = await user.agent.get(`/api/documents/${scenario.ids[index]}/download`).buffer(true).parse(binaryParser);
  expect(response.status).toBe(200);
  expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
}
async function history(user: TestUser, count: number) {
  await vi.waitFor(async () => expect((await settings(user)).historyItems).toBe(count), { timeout: 5000 });
}
async function learn(user: TestUser, start: number) {
  await enable(user);
  for (const index of [start, start + 1, start + 2]) await view(user, index);
  await download(user, start);
  await history(user, 4);
}

describe('personalization through real reading and download requests', () => {
  it('starts off and ignores guest, self, private and opted-out views', async () => {
    expect(await settings(cloud)).toEqual({ personalizationEnabled: false, historyItems: 0 });
    await view(cloud, 0);
    expect((await request(scenario.ctx.app).get(`/api/documents/${scenario.ids[0]}`)).status).toBe(200);
    await enable(scenario.owner);
    await view(scenario.owner, 0);
    await view(scenario.owner, 9);
    expect((await cloud.agent.get(`/api/documents/${scenario.ids[9]}`)).status).toBe(404);
    expect((await cloud.agent.get(`/api/documents/${scenario.ids[28]}`)).status).toBe(404);
    // A recorded follow-up provides a completion barrier for the negative cases.
    await enable(ai);
    await view(ai, 10);
    await history(ai, 1);
    const rows = await scenario.ctx.prisma.documentInteraction.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: ai.id, documentId: scenario.ids[10], kind: 'VIEW' });
    expect((await home(cloud)).strategy).not.toBe('PERSONALIZED');
  });

  it('learns different Cloud and AI preferences from actual views and downloads', async () => {
    await learn(cloud, 0);
    await learn(ai, 10);
    await scenario.ctx.services.recommendations.index.refresh();
    const cloudHome = await home(cloud), aiHome = await home(ai);
    expect(cloudHome.strategy).toBe('PERSONALIZED');
    expect(aiHome.strategy).toBe('PERSONALIZED');
    expect(cloudHome.items.filter(({ document }) => document.title.startsWith('AWS')).length).toBeGreaterThanOrEqual(3);
    expect(aiHome.items.filter(({ document }) => document.title.startsWith('AI')).length).toBeGreaterThanOrEqual(3);
    expect(cloudHome.items.some(({ reason }) => reason === 'SIMILAR_TO_HISTORY')).toBe(true);
    for (const [result, read] of [[cloudHome, scenario.ids.slice(0, 3)], [aiHome, scenario.ids.slice(10, 13)]] as const) {
      expect(result.items.every(({ document }) => document.visibility === 'PUBLIC')).toBe(true);
      for (const id of read) expect(result.items.map(({ document }) => document.id)).not.toContain(id);
    }
    expect(cloudHome.items.filter(({ document }) => aiHome.items.some((item) => item.document.id === document.id))).toHaveLength(0);
  });

  it('deduplicates repeated views/downloads while keeping both interaction kinds', async () => {
    await enable(cloud);
    await view(cloud, 0);
    await history(cloud, 1);
    const first = await scenario.ctx.prisma.documentInteraction.findFirstOrThrow({ where: { userId: cloud.id } });
    for (let count = 0; count < 5; count++) await view(cloud, 0);
    await download(cloud, 0);
    await download(cloud, 0);
    await history(cloud, 2);
    const rows = await scenario.ctx.prisma.documentInteraction.findMany({ where: { userId: cloud.id } });
    expect(rows.map((row) => row.kind).sort()).toEqual(['DOWNLOAD', 'VIEW']);
    expect(rows.find((row) => row.kind === 'VIEW')!.firstAt).toEqual(first.firstAt);
    expect(rows.find((row) => row.kind === 'VIEW')!.lastAt.getTime()).toBeGreaterThan(first.lastAt.getTime());
    expect((await settings(ai)).historyItems).toBe(0);
  });

  it('clears only the current user history, immediately resets the profile and learns a new topic', async () => {
    await learn(cloud, 0);
    await learn(ai, 10);
    expect((await home(cloud)).strategy).toBe('PERSONALIZED');
    expect((await cloud.agent.delete(`/api/recommendations/history?userId=${ai.id}`).set(CSRF)).status).toBe(204);
    expect(await settings(cloud)).toEqual({ personalizationEnabled: true, historyItems: 0 });
    expect((await settings(ai)).historyItems).toBe(4);
    expect((await home(cloud)).strategy).not.toBe('PERSONALIZED');
    await view(cloud, 10);
    await history(cloud, 1);
    const changed = await home(cloud);
    expect(changed.strategy).toBe('PERSONALIZED');
    expect(changed.items[0]!.document.title).toMatch(/^AI/);
  });

  it('persists opt-out through logout/login and does not resurrect the old profile on opt-in', async () => {
    await learn(cloud, 0);
    expect(await enable(cloud, false)).toEqual({ personalizationEnabled: false, historyItems: 0 });
    await view(cloud, 1);
    await download(cloud, 0);
    expect((await cloud.agent.post('/api/auth/logout').set(CSRF)).status).toBe(204);
    expect((await cloud.agent.post('/api/auth/login').set(CSRF).send({ email: cloud.email, password: 'matkhau123' })).status).toBe(200);
    expect(await settings(cloud)).toEqual({ personalizationEnabled: false, historyItems: 0 });
    expect((await home(cloud)).strategy).not.toBe('PERSONALIZED');
    expect(await enable(cloud)).toEqual({ personalizationEnabled: true, historyItems: 0 });
    expect((await home(cloud)).strategy).not.toBe('PERSONALIZED');
    await view(cloud, 10);
    await history(cloud, 1);
    expect((await home(cloud)).items[0]!.document.title).toMatch(/^AI/);
  });

  it('does not learn from a failed real S3 download', async () => {
    await enable(cloud);
    // This catalog entry intentionally has no object in the test bucket.
    expect((await cloud.agent.get(`/api/documents/${scenario.ids[1]}/download`)).status).toBe(503);
    await download(cloud, 0);
    await history(cloud, 1);
    expect(await scenario.ctx.prisma.documentInteraction.findMany({ where: { userId: cloud.id } })).toEqual([
      expect.objectContaining({ documentId: scenario.ids[0], kind: 'DOWNLOAD' }),
    ]);
  });

  it('keeps explicit AI search and AWS related results independent from Cloud preferences', async () => {
    await learn(cloud, 0);
    const search = await cloud.agent.get('/api/documents?q=AI&sort=relevance&pageSize=50');
    expect(search.status).toBe(200);
    expect(search.body.data.items.length).toBeGreaterThan(0);
    // Accent-insensitive substring search also matches "AI" inside "bài".
    // All nine public AI titles must still precede description-only matches.
    expect(search.body.data.items.filter((document: { title: string }) => document.title.startsWith('AI'))).toHaveLength(9);
    expect(search.body.data.items.slice(0, 9).every((document: { title: string }) => document.title.startsWith('AI'))).toBe(true);
    const related = await cloud.agent.get(`/api/documents/${scenario.ids[0]}/related?limit=4`);
    expect(related.status).toBe(200);
    expect(related.body.data.items).toHaveLength(4);
    expect(related.body.data.items.every((document: { title: string; id: string }) => document.title.startsWith('AWS') && document.id !== scenario.ids[0])).toBe(true);
  });

  it('rehydrates stale results after privacy/deletion changes and stops using now-private history', async () => {
    await enable(cloud);
    await view(cloud, 0);
    await history(cloud, 1);
    expect((await home(cloud)).strategy).toBe('PERSONALIZED');
    expect((await scenario.owner.agent.patch(`/api/documents/${scenario.ids[0]}`).set(CSRF).send({ visibility: 'PRIVATE' })).status).toBe(200);
    expect((await scenario.owner.agent.delete(`/api/documents/${scenario.ids[1]}`).set(CSRF)).status).toBe(204);
    const result = await home(cloud);
    expect(result.strategy).not.toBe('PERSONALIZED');
    const related = await cloud.agent.get(`/api/documents/${scenario.ids[2]}/related?limit=12`);
    const suggestions = await cloud.agent.get('/api/recommendations/suggestions?q=AWS');
    for (const id of [scenario.ids[0], scenario.ids[1], scenario.ids[9], scenario.ids[28]]) {
      expect(result.items.map(({ document }) => document.id)).not.toContain(id);
      expect(related.body.data.items.map((document: { id: string }) => document.id)).not.toContain(id);
      expect(suggestions.body.data.items.map((document: { documentId: string }) => document.documentId)).not.toContain(id);
    }
  });
});
