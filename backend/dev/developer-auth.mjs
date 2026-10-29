/* global process, console, Buffer */
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { runtimeDir } from './local-config.mjs';

const deriveKey = promisify(scrypt);
export const developerAccountFile = join(runtimeDir, 'developer-account.json');
const cookieName = 'btl_developer';
const sessionSeconds = 8 * 60 * 60;
const cookie = (value, seconds) => `${cookieName}=${value}; Path=/__local/backend; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
const sessionId = (header = '') => header.match(/(?:^|;\s*)btl_developer=([a-f0-9]{64})(?:;|$)/)?.[1];

// Only this command provisions the local developer account. Web registration cannot grant access.
export async function provisionDeveloper(username = 'developer', file = developerAccountFile, reset = false) {
  if (!/^[a-zA-Z0-9._@-]{1,80}$/.test(username)) throw new Error('Tên tài khoản phải có 1–80 ký tự chữ, số, dấu chấm, @, _ hoặc -.');
  const password = randomBytes(18).toString('base64url');
  const salt = randomBytes(16).toString('hex');
  const passwordHash = Buffer.from(await deriveKey(password, salt, 64)).toString('hex');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ username, salt, passwordHash }, null, 2) + '\n', { mode: 0o600, flag: reset ? 'w' : 'wx' });
  return { username, password };
}

export function createDeveloperAuth({ file = developerAccountFile, now = Date.now } = {}) {
  const sessions = new Map();
  let attempts = 0;
  let retryAt = 0;
  async function account() {
    try { return JSON.parse(await readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function prune() {
    for (const [id, session] of sessions) if (session.expiresAt <= now()) sessions.delete(id);
  }
  return {
    async status(header) {
      prune();
      const saved = await account();
      const id = sessionId(header);
      const session = sessions.get(id);
      if (session && session.account !== JSON.stringify(saved)) sessions.delete(id);
      return { configured: Boolean(saved), user: sessions.has(id) ? { username: saved.username } : null };
    },
    async login(username, password, header) {
      if (now() >= retryAt) { attempts = 0; retryAt = now() + 60_000; }
      if (attempts >= 5) return { status: 429, error: 'Thử đăng nhập quá nhiều lần. Vui lòng thử lại sau một phút.' };
      attempts++;
      const saved = await account();
      if (!saved) return { status: 403, error: 'Chưa được cấp tài khoản nhà phát triển. Hãy liên hệ người quản lý dự án.' };
      if (typeof username !== 'string' || typeof password !== 'string' || password.length > 128 || username.length > 80)
        return { status: 401, error: 'Tài khoản hoặc mật khẩu không đúng.' };
      const actual = Buffer.from(await deriveKey(password, saved.salt, 64));
      const expected = Buffer.from(saved.passwordHash, 'hex');
      if (username !== saved.username || actual.length !== expected.length || !timingSafeEqual(actual, expected))
        return { status: 401, error: 'Tài khoản hoặc mật khẩu không đúng.' };
      attempts = 0;
      prune();
      sessions.delete(sessionId(header));
      const id = randomBytes(32).toString('hex');
      sessions.set(id, { account: JSON.stringify(saved), expiresAt: now() + sessionSeconds * 1000 });
      return { status: 200, user: { username: saved.username }, cookie: cookie(id, sessionSeconds) };
    },
    logout(header) {
      sessions.delete(sessionId(header));
      return cookie('', 0);
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  provisionDeveloper(args.find((arg) => arg !== '--reset') ?? 'developer', developerAccountFile, args.includes('--reset'))
    .then(({ username, password }) => {
      console.log(`Tài khoản: ${username}\nMật khẩu: ${password}\nChỉ hiển thị mật khẩu lần này. Kho tài khoản (chỉ lưu bản băm): ${developerAccountFile}`);
    })
    .catch((error) => {
      console.error(error.code === 'EEXIST' ? 'Tài khoản developer đã có. Dùng --reset nếu muốn cấp lại mật khẩu và thu hồi phiên cũ.' : error.message);
      process.exitCode = 1;
    });
}
