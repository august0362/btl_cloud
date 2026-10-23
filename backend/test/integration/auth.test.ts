import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashSessionToken } from '../../src/modules/auth/session-token.js';
import { expectError, userDtoSchema } from '../helpers/contract.js';
import { CSRF, createTestContext, registerUser, resetDatabase, uniqueEmail, type TestContext } from './context.js';

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

function sessionCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const sid = cookies.find((c) => c.startsWith('sid=') && !c.startsWith('sid=;'));
  if (!sid) throw new Error(`Không có cookie phiên: ${JSON.stringify(cookies)}`);
  return sid.split(';')[0] as string;
}

describe('API-04 đăng ký (FR-01)', () => {
  it('AC-01.1: 201, UserDto đúng hợp đồng, cookie HttpOnly SameSite=Lax Path=/ Max-Age 7 ngày, email được chuẩn hoá', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/register')
      .set(CSRF)
      .send({ email: '  SV.Moi@Example.COM ', password: 'matkhau123', displayName: ' Nguyễn Văn A ' });
    expect(res.status).toBe(201);
    const user = userDtoSchema.parse(res.body.data.user);
    expect(user).toMatchObject({ email: 'sv.moi@example.com', displayName: 'Nguyễn Văn A' });
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/^sid=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('Max-Age=604800');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).not.toContain('Secure');
  });

  it('AC-01.6: DB chỉ lưu hash argon2id và hash của token phiên', async () => {
    const res = await request(ctx.app).post('/api/auth/register').set(CSRF).send({ email: uniqueEmail(), password: 'matkhau123', displayName: 'A' });
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: res.body.data.user.id } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$v=19\$/);
    const params = row.passwordHash.split('$')[3]?.split(',').sort();
    expect(params).toEqual(['m=19456', 'p=1', 't=2']);
    expect(row.passwordHash).not.toContain('matkhau123');
    const token = sessionCookie(res).slice('sid='.length);
    const session = await ctx.prisma.session.findFirstOrThrow({ where: { userId: row.id } });
    expect(session.id).toBe(hashSessionToken(token));
    expect(session.id).not.toBe(token);
  });

  it('AC-01.2: trùng email (khác hoa thường) → 409 EMAIL_ALREADY_EXISTS, không tạo bản ghi thừa', async () => {
    const email = uniqueEmail();
    await request(ctx.app).post('/api/auth/register').set(CSRF).send({ email, password: 'matkhau123', displayName: 'A' });
    const dup = await request(ctx.app).post('/api/auth/register').set(CSRF).send({ email: email.toUpperCase(), password: 'matkhau456', displayName: 'B' });
    expect(expectError(dup, 409, 'EMAIL_ALREADY_EXISTS')).toEqual([]);
    expect(await ctx.prisma.user.count()).toBe(1);
    expect(await ctx.prisma.session.count()).toBe(1);
  });

  it('dữ liệu không hợp lệ → 400 theo trường, không tạo user', async () => {
    const res = await request(ctx.app).post('/api/auth/register').set(CSRF).send({ email: 'sai', password: 'ngan', displayName: '', role: 'admin' });
    const details = expectError(res, 400, 'VALIDATION_ERROR');
    expect(details.map((d) => `${d.field}:${d.issue}`)).toEqual(['email:INVALID_FORMAT', 'password:TOO_SHORT', 'displayName:REQUIRED', 'role:UNKNOWN_FIELD']);
    expect(await ctx.prisma.user.count()).toBe(0);
  });
});

describe('API-05 đăng nhập / API-03 / API-06', () => {
  it('đăng nhập đúng → 200 + cookie; API-03 trả đúng user', async () => {
    const user = await registerUser(ctx.app);
    const agent = request.agent(ctx.app);
    const login = await agent.post('/api/auth/login').set(CSRF).send({ email: user.email.toUpperCase(), password: 'matkhau123' });
    expect(login.status).toBe(200);
    expect(userDtoSchema.parse(login.body.data.user).id).toBe(user.id);
    const me = await agent.get('/api/auth/me');
    expect(me.body.data.user).toMatchObject({ id: user.id, email: user.email, displayName: user.displayName });
  });

  it('AC-01.3: sai mật khẩu và email không tồn tại → cùng 401 INVALID_CREDENTIALS, body giống nhau (trừ requestId)', async () => {
    const user = await registerUser(ctx.app);
    const wrongPassword = await request(ctx.app).post('/api/auth/login').set(CSRF).send({ email: user.email, password: 'sai-mat-khau' });
    const unknownEmail = await request(ctx.app).post('/api/auth/login').set(CSRF).send({ email: 'khong-ton-tai@example.com', password: 'sai-mat-khau' });
    expectError(wrongPassword, 401, 'INVALID_CREDENTIALS');
    expectError(unknownEmail, 401, 'INVALID_CREDENTIALS');
    const strip = (body: { error: Record<string, unknown> }) => ({ ...body.error, requestId: undefined });
    expect(strip(wrongPassword.body)).toEqual(strip(unknownEmail.body));
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });

  it('đăng nhập xoay phiên: phiên của cookie cũ bị xoá (chống session fixation)', async () => {
    const user = await registerUser(ctx.app);
    const before = await ctx.prisma.session.findMany({ where: { userId: user.id } });
    expect(before).toHaveLength(1);
    await user.agent.post('/api/auth/login').set(CSRF).send({ email: user.email, password: 'matkhau123' });
    const after = await ctx.prisma.session.findMany({ where: { userId: user.id } });
    expect(after).toHaveLength(1);
    expect(after[0]?.id).not.toBe(before[0]?.id);
  });

  it('AC-01.4: sau đăng xuất, cookie cũ gửi lại → API-08 401 và API-03 user null trên mọi instance', async () => {
    const user = await registerUser(ctx.app);
    const res = await user.agent.post('/api/auth/login').set(CSRF).send({ email: user.email, password: 'matkhau123' });
    const cookie = sessionCookie(res);
    const logout = await user.agent.post('/api/auth/logout').set(CSRF);
    expect(logout.status).toBe(204);
    expect(String(logout.headers['set-cookie'])).toContain('sid=; Max-Age=0');
    expect(await ctx.prisma.session.count({ where: { userId: user.id } })).toBe(0);

    // Instance thứ hai dùng chung DB (NFR-SCL-01): phiên đã thu hồi cũng vô hiệu ở đó.
    const other = await createTestContext();
    try {
      for (const app of [ctx.app, other.app]) {
        expectError(await request(app).get('/api/documents/mine').set('Cookie', cookie), 401, 'UNAUTHENTICATED');
        const me = await request(app).get('/api/auth/me').set('Cookie', cookie);
        expect(me.body).toEqual({ data: { user: null } });
      }
    } finally {
      await other.close();
    }
  });

  it('phiên tạo ở instance A dùng được ở instance B (phiên lưu DB, stateless)', async () => {
    const user = await registerUser(ctx.app);
    const res = await request(ctx.app).post('/api/auth/login').set(CSRF).send({ email: user.email, password: 'matkhau123' });
    const other = await createTestContext({ INSTANCE_ID: 'instance-b' });
    try {
      const me = await request(other.app).get('/api/auth/me').set('Cookie', sessionCookie(res));
      expect(me.body.data.user.id).toBe(user.id);
    } finally {
      await other.close();
    }
  });

  it('phiên hết hạn → 401, bản ghi bị xoá, cookie bị xoá', async () => {
    const user = await registerUser(ctx.app);
    await ctx.prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await user.agent.get('/api/documents/mine');
    expectError(res, 401, 'UNAUTHENTICATED');
    expect(String(res.headers['set-cookie'])).toContain('sid=; Max-Age=0');
    expect(await ctx.prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('cookie giả → phục vụ như Guest và xoá cookie', async () => {
    const res = await request(ctx.app).get('/api/auth/me').set('Cookie', 'sid=khong-phai-token-that');
    expect(res.body).toEqual({ data: { user: null } });
    expect(String(res.headers['set-cookie'])).toContain('sid=; Max-Age=0');
  });
});
