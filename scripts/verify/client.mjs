import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';

export const base = process.env.VERIFY_BASE_URL ?? 'http://localhost:3000';
export const marker = `verify-${randomUUID()}`;
export const pdf = Buffer.from('%PDF-1.7\n% verification\n%%EOF\n');
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const rows = [];
export function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  rows.push({ check: name, result: 'PASS' });
}
export function client() {
  let cookie = '';
  return async (method, route, body, csrf = true) => {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    if (!['GET', 'HEAD'].includes(method) && csrf) headers['X-CSRF-Protection'] = '1';
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const res = await fetch(new URL(route, base), { method, headers, body });
    for (const value of res.headers.getSetCookie()) cookie = value.split(';')[0];
    const bytes = Buffer.from(await res.arrayBuffer());
    let data;
    if (res.headers.get('content-type')?.includes('application/json')) data = JSON.parse(bytes.toString());
    return { status: res.status, data: data?.data, error: data?.error, bytes, headers: res.headers };
  };
}
export async function register(call, label) {
  const res = await call('POST', '/api/auth/register', {
    email: `${marker}-${label}@example.com`, password: 'Verify-password-123', displayName: `Verify ${label}`,
  });
  check(`register ${label}`, res.status, 201);
  return res.data.user;
}
export function form(bytes = pdf, filename = 'test.pdf', visibility = 'PUBLIC', title = marker) {
  const body = new FormData();
  body.set('title', title);
  body.set('visibility', visibility);
  body.set('file', new Blob([bytes]), filename);
  return body;
}
export async function upload(call, visibility = 'PUBLIC', bytes = pdf, filename = 'test.pdf') {
  const res = await call('POST', '/api/documents', form(bytes, filename, visibility));
  check(`upload ${visibility} ${filename}`, res.status, 201);
  return res.data;
}
// Minimal stored ZIP fixture with a valid central directory; no runtime dependencies.
export function office(extension) {
  const entries = [['[Content_Types].xml', '<Types/>'], [extension === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml', '<document/>']];
  const local = [], central = [];
  let offset = 0;
  for (const [filename, text] of entries) {
    const name = Buffer.from(filename), bytes = Buffer.from(text);
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(name.length, 26);
    local.push(header, name, bytes);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(bytes.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, name); offset += header.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
