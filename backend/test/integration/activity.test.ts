import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext, registerUser, resetDatabase, type TestContext } from './context.js';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDatabase(ctx.prisma);
});

interface ActivityRow {
  last_active_at: Date | null;
  updated_at: Date;
}

async function activityRow(userId: string): Promise<ActivityRow> {
  const rows = await ctx.prisma.$queryRaw<ActivityRow[]>`SELECT last_active_at, updated_at FROM users WHERE id = ${userId}`;
  return rows[0] as ActivityRow;
}

/** Ghi hoạt động không được chờ trong request → đợi tối đa 2 s. */
async function waitForActivity(userId: string): Promise<ActivityRow> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const row = await activityRow(userId);
    if (row.last_active_at !== null) return row;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return activityRow(userId);
}

describe('XM-01 activity tracker (E1-01)', () => {
  it('migration: users.last_active_at DATETIME(3) NULL + index', async () => {
    const columns = await ctx.prisma.$queryRaw<Array<{ Field: string; Type: string; Null: string }>>`DESCRIBE users`;
    expect(columns.find((c) => c.Field === 'last_active_at')).toMatchObject({ Type: 'datetime(3)', Null: 'YES' });
    const indexes = await ctx.prisma.$queryRaw<Array<{ Column_name: string }>>`SHOW INDEX FROM users WHERE Key_name = 'idx_users_last_active_at'`;
    expect(indexes.map((i) => i.Column_name)).toEqual(['last_active_at']);
  });

  it('request đã đăng nhập ghi last_active_at, không đổi updated_at; request thứ hai trong 5 phút không ghi lại', async () => {
    const user = await registerUser(ctx.app);
    const before = await activityRow(user.id);
    expect(before.last_active_at).toBeNull();

    const me = await user.agent.get('/api/auth/me');
    expect(me.body.data.user.id).toBe(user.id);
    const first = await waitForActivity(user.id);
    expect(first.last_active_at).not.toBeNull();
    expect(first.updated_at.getTime()).toBe(before.updated_at.getTime());

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect((await user.agent.get('/api/documents/mine')).status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const second = await activityRow(user.id);
    expect(second.last_active_at?.getTime()).toBe(first.last_active_at?.getTime());
    expect(second.updated_at.getTime()).toBe(before.updated_at.getTime());
  });

  it('Guest không tạo ghi; lỗi ghi không làm hỏng request', async () => {
    const user = await registerUser(ctx.app);
    expect((await request(ctx.app).get('/api/documents')).status).toBe(200);
    expect((await activityRow(user.id)).last_active_at).toBeNull();

    const spy = vi.spyOn(ctx.services.users, 'touchLastActive').mockRejectedValueOnce(new Error('db down'));
    try {
      expect((await user.agent.get('/api/auth/me')).status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});
