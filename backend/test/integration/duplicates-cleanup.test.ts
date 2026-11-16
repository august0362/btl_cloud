import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { planPrivateDuplicates, applyPrivateDuplicatePlan } from '../../scripts/cleanup-private-duplicates.js';
import { createTestContext, registerUser, resetDatabase, uploadRequest, type TestContext, type TestUser } from './context.js';

let ctx: TestContext;
let privateOwner: TestUser, publicOwner: TestUser;
const bytes = Buffer.from('%PDF-1.7\ncleanup bytes\n%%EOF');
beforeAll(async () => { ctx = await createTestContext({ DUPLICATE_MODE: 'off' }); });
afterAll(async () => { await ctx.close(); });
beforeEach(async () => {
  await resetDatabase(ctx.prisma); ctx.storage.reset();
  privateOwner = await registerUser(ctx.app); publicOwner = await registerUser(ctx.app);
});
async function pair() {
  const a = await uploadRequest(privateOwner, { title: 'private fixture', visibility: 'PRIVATE', file: bytes });
  const b = await uploadRequest(publicOwner, { title: 'public fixture', visibility: 'PUBLIC', file: bytes });
  expect(a.status, JSON.stringify(a.body)).toBe(201); expect(b.status, JSON.stringify(b.body)).toBe(201);
  return { privateId: a.body.data.id as string, publicId: b.body.data.id as string };
}
it('previews without deleting and applies only the private copy, even across owners', async () => {
  const ids = await pair();
  await ctx.prisma.documentInteraction.create({ data: { userId: publicOwner.id, documentId: ids.privateId, kind: 'VIEW', firstAt: new Date(), lastAt: new Date() } });
  const plan = await planPrivateDuplicates(ctx.prisma, 'local-test');
  expect(plan.candidates).toHaveLength(1);
  expect(plan.candidates[0]).toMatchObject(ids);
  expect(await ctx.prisma.document.count()).toBe(2);
  const result = await applyPrivateDuplicatePlan(ctx.prisma, ctx.storage, plan);
  expect(result).toEqual({ deleted: [ids.privateId], skipped: [], storageDeleteFailed: [] });
  expect(await ctx.prisma.document.count()).toBe(1);
  expect(await ctx.prisma.documentFingerprint.count()).toBe(1);
  expect(await ctx.prisma.documentInteraction.count()).toBe(0);
  expect(await ctx.prisma.auditEvent.findFirst({ where: { action: 'DOCUMENT_DELETE', targetId: ids.privateId } }))
    .toMatchObject({ actorType: 'DEVELOPER', outcome: 'SUCCESS', metadata: { source: 'private-duplicate-cleanup', retainedPublicId: ids.publicId } });
  expect(await ctx.prisma.document.findUnique({ where: { id: ids.publicId } })).not.toBeNull();
  await expect(ctx.s3.getObject(plan.candidates[0]!.privateKey)).rejects.toMatchObject({ kind: 'NOT_FOUND' });
  const kept = await ctx.s3.getObject(plan.candidates[0]!.publicKey);
  const chunks: Buffer[] = []; for await (const chunk of kept.body) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(bytes);
  expect((await planPrivateDuplicates(ctx.prisma, 'local-test')).candidates).toEqual([]);
  expect((await applyPrivateDuplicatePlan(ctx.prisma, ctx.storage, plan)).deleted).toEqual([]);
});
it('does not plan private/private groups, different bytes, stale fingerprints or deleting public owners', async () => {
  const a = await uploadRequest(privateOwner, { title: 'private fixture', visibility: 'PRIVATE', file: bytes });
  await uploadRequest(publicOwner, { title: 'public fixture', visibility: 'PRIVATE', file: bytes });
  await uploadRequest(publicOwner, { title: 'public fixture', visibility: 'PUBLIC', file: Buffer.from('%PDF-1.7\ndifferent\n%%EOF') });
  expect((await planPrivateDuplicates(ctx.prisma, 'test')).candidates).toEqual([]);
  const b = await uploadRequest(publicOwner, { title: 'public fixture', visibility: 'PUBLIC', file: bytes });
  await ctx.prisma.document.update({ where: { id: a.body.data.id }, data: { fileVersion: { increment: 1 } } });
  expect((await planPrivateDuplicates(ctx.prisma, 'test')).candidates).toHaveLength(1); // second private only
  await ctx.prisma.user.update({ where: { id: publicOwner.id }, data: { deletionStartedAt: new Date() } });
  expect((await planPrivateDuplicates(ctx.prisma, 'test')).candidates).toEqual([]);
  expect(await ctx.prisma.document.findUnique({ where: { id: b.body.data.id } })).not.toBeNull();
});
it.each(['public-private', 'private-public', 'version', 'deleted-public', 'deleting-owner'])(
  'rechecks a saved plan and preserves private data after %s changes', async (change) => {
    const ids = await pair(); const plan = await planPrivateDuplicates(ctx.prisma, 'test');
    if (change === 'public-private') await ctx.prisma.document.update({ where: { id: ids.publicId }, data: { visibility: 'PRIVATE' } });
    if (change === 'private-public') await ctx.prisma.document.update({ where: { id: ids.privateId }, data: { visibility: 'PUBLIC' } });
    if (change === 'version') await ctx.prisma.document.update({ where: { id: ids.publicId }, data: { fileVersion: { increment: 1 } } });
    if (change === 'deleted-public') await ctx.prisma.document.delete({ where: { id: ids.publicId } });
    if (change === 'deleting-owner') await ctx.prisma.user.update({ where: { id: publicOwner.id }, data: { deletionStartedAt: new Date() } });
    expect(await applyPrivateDuplicatePlan(ctx.prisma, ctx.storage, plan)).toEqual({ deleted: [], skipped: [ids.privateId], storageDeleteFailed: [] });
    expect(await ctx.prisma.document.findUnique({ where: { id: ids.privateId } })).not.toBeNull();
    const object = await ctx.s3.getObject(plan.candidates[0]!.privateKey); object.body.destroy();
  });
it('preserves private data when the public object is unavailable', async () => {
  const ids = await pair(); const plan = await planPrivateDuplicates(ctx.prisma, 'test');
  await ctx.s3.deleteObject(plan.candidates[0]!.publicKey);
  expect((await applyPrivateDuplicatePlan(ctx.prisma, ctx.storage, plan)).skipped).toEqual([ids.privateId]);
  expect(await ctx.prisma.document.count()).toBe(2);
});
it('reports an orphan when storage deletion fails after metadata commit', async () => {
  const ids = await pair(); const plan = await planPrivateDuplicates(ctx.prisma, 'test');
  ctx.storage.failDelete = 1;
  expect(await applyPrivateDuplicatePlan(ctx.prisma, ctx.storage, plan))
    .toEqual({ deleted: [ids.privateId], skipped: [], storageDeleteFailed: [ids.privateId] });
  expect(await ctx.prisma.document.count()).toBe(1);
  const object = await ctx.s3.getObject(plan.candidates[0]!.privateKey); object.body.destroy();
});
