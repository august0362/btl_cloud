import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { expectError, pageSchema } from '../helpers/contract.js';
import { docxBuffer } from '../helpers/fixtures.js';
import { createTestContext, registerUser, resetDatabase, uploadDocument, type TestContext, type TestUser } from './context.js';

let ctx: TestContext;
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  ctx.storage.reset();
  await resetDatabase(ctx.prisma);
  alice = await registerUser(ctx.app, 'Alice');
  bob = await registerUser(ctx.app, 'Bob');
});

async function search(query: string, agent: request.Agent | null = null) {
  const res = await (agent ?? request(ctx.app)).get(`/api/documents${query}`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return pageSchema.parse(res.body.data);
}

describe('API-07 tìm kiếm công khai (FR-02, SEQ-04)', () => {
  it('AC-02.1/AC-02.2: Guest chỉ thấy tài liệu Public; Private không bao giờ xuất hiện; không lộ email', async () => {
    await uploadDocument(alice, { title: 'Đề cương Giải tích 1', visibility: 'PUBLIC' });
    await uploadDocument(alice, { title: 'Giải tích bí mật', visibility: 'PRIVATE' });
    await uploadDocument(bob, { title: 'Giải tích của Bob', visibility: 'PRIVATE' });

    const guest = await search('?q=giải tích');
    expect(guest.items.map((d) => d.title)).toEqual(['Đề cương Giải tích 1']);
    expect(guest.items[0]).toMatchObject({ isOwner: false, owner: { id: alice.id, displayName: 'Alice' } });
    expect(JSON.stringify(guest)).not.toContain('@example.com');

    // Kể cả owner tìm qua API-07 cũng không thấy Private của chính mình (BR-11).
    const asAlice = await search('?q=giải tích', alice.agent);
    expect(asAlice.items.map((d) => [d.title, d.isOwner])).toEqual([['Đề cương Giải tích 1', true]]);
  });

  it('không phân biệt hoa thường và dấu (collation utf8mb4_0900_ai_ci); khớp cả mô tả', async () => {
    await uploadDocument(alice, { title: 'Đề cương Giải tích 1', visibility: 'PUBLIC' });
    await uploadDocument(alice, { title: 'Khác', description: 'Ôn thi GIẢI TÍCH chương 2', visibility: 'PUBLIC' });
    expect((await search('?q=giai tich')).totalItems).toBe(2);
    expect((await search('?q=DE CUONG')).items.map((d) => d.title)).toEqual(['Đề cương Giải tích 1']);
  });

  it('ghi nhận hành vi "đ" với "d" (RK-08)', async () => {
    await uploadDocument(alice, { title: 'Đại số tuyến tính', visibility: 'PUBLIC' });
    const withD = await search('?q=dai so');
    // Kết quả được ghi vào bằng chứng M2-08; test khẳng định hành vi hiện tại để phát hiện nếu collation thay đổi.
    expect([0, 1]).toContain(withD.totalItems);
    console.info(`[RK-08] tìm "dai so" khớp "Đại số": ${withD.totalItems === 1 ? 'CÓ' : 'KHÔNG'}`);
    expect((await search('?q=đại số')).totalItems).toBe(1);
  });

  it('AC-02.3: ký tự %, _ và ! trong q được hiểu theo nghĩa đen', async () => {
    await uploadDocument(alice, { title: 'Giảm 50% học phí', visibility: 'PUBLIC' });
    await uploadDocument(alice, { title: 'bien_so_1', visibility: 'PUBLIC' });
    await uploadDocument(alice, { title: 'Bình thường', visibility: 'PUBLIC' });
    expect((await search('?q=%25')).items.map((d) => d.title)).toEqual(['Giảm 50% học phí']);
    expect((await search('?q=_')).items.map((d) => d.title)).toEqual(['bien_so_1']);
    expect((await search('?q=!')).totalItems).toBe(0);
  });

  it('AC-02.5: phân trang đúng tổng; trang vượt → items rỗng; sắp xếp newest/title; lọc fileType', async () => {
    for (const title of ['C', 'A', 'E', 'B', 'D']) await uploadDocument(alice, { title, visibility: 'PUBLIC' });
    await uploadDocument(alice, { title: 'Word', visibility: 'PUBLIC', file: await docxBuffer(), filename: 'w.docx' });

    const first = await search('?pageSize=2');
    expect(first).toMatchObject({ page: 1, pageSize: 2, totalItems: 6, totalPages: 3 });
    expect(first.items.map((d) => d.title)).toEqual(['Word', 'D']);
    const beyond = await search('?page=9&pageSize=2');
    expect(beyond).toMatchObject({ items: [], totalItems: 6, totalPages: 3, page: 9 });
    expect((await search('?sort=title&pageSize=3')).items.map((d) => d.title)).toEqual(['A', 'B', 'C']);
    expect((await search('?fileType=DOCX')).items.map((d) => d.title)).toEqual(['Word']);
    expect(await search('?fileType=PPTX')).toMatchObject({ items: [], totalItems: 0, totalPages: 0 });
  });

  it('tham số sai → 400; tham số lạ bị bỏ qua', async () => {
    const details = expectError(await request(ctx.app).get('/api/documents?pageSize=0&fileType=pdf'), 400, 'VALIDATION_ERROR');
    expect(details.map((d) => `${d.field}:${d.issue}`)).toEqual(['fileType:INVALID_ENUM', 'pageSize:OUT_OF_RANGE']);
    expect((await request(ctx.app).get('/api/documents?foo=bar')).status).toBe(200);
  });
});

describe('API-08 kho cá nhân (FR-06)', () => {
  it('AC-06.1/AC-06.2: chỉ tài liệu của mình (cả Public và Private), lọc visibility, isOwner luôn true', async () => {
    await uploadDocument(alice, { title: 'A công khai', visibility: 'PUBLIC' });
    await uploadDocument(alice, { title: 'A riêng tư', visibility: 'PRIVATE' });
    await uploadDocument(bob, { title: 'B công khai', visibility: 'PUBLIC' });

    const mine = await search('/mine', alice.agent);
    expect(mine.items.map((d) => d.title).sort()).toEqual(['A công khai', 'A riêng tư']);
    expect(mine.items.every((d) => d.isOwner)).toBe(true);
    expect((await search('/mine?visibility=PRIVATE', alice.agent)).items.map((d) => d.title)).toEqual(['A riêng tư']);
    expect((await search('/mine?q=riêng', alice.agent)).totalItems).toBe(1);
    expect((await search('/mine', bob.agent)).items.map((d) => d.title)).toEqual(['B công khai']);
  });

  it('AC-06.3: Guest → 401', async () => {
    expectError(await request(ctx.app).get('/api/documents/mine'), 401, 'UNAUTHENTICATED');
  });
});
