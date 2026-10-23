import { mkdir } from 'node:fs/promises';
import { Writable } from 'node:stream';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import type { Config } from '../../src/config/env.js';
import { createServices, type Services } from '../../src/container.js';
import { createPrismaClient } from '../../src/db/prisma.js';
import { createLogger } from '../../src/lib/logger.js';
import { StorageError } from '../../src/storage/object-storage.js';
import { S3ObjectStorage } from '../../src/storage/s3-object-storage.js';
import { testConfig } from '../helpers/config.js';
import { FaultInjectingStorage } from '../helpers/fault-storage.js';
import { pdfBuffer } from '../helpers/fixtures.js';

export const CSRF = { 'X-CSRF-Protection': '1' } as const;

export interface TestContext {
  app: Express;
  config: Config;
  prisma: PrismaClient;
  s3: S3ObjectStorage;
  storage: FaultInjectingStorage;
  services: Services;
  logs: string[];
  close(): Promise<void>;
}

/** App thật + MySQL test + storage S3-compatible thật, bọc bởi FaultInjectingStorage. */
export async function createTestContext(overrides: Record<string, string> = {}): Promise<TestContext> {
  const config = testConfig(overrides);
  await mkdir(config.upload.tmpDir, { recursive: true });
  const logs: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      logs.push(String(chunk));
      callback();
    },
  });
  const logger = createLogger({ level: overrides.LOG_LEVEL ?? 'silent', instanceId: config.instanceId }, sink);
  const prisma = createPrismaClient(config.databaseUrl);
  const s3 = new S3ObjectStorage(config.s3);
  const storage = new FaultInjectingStorage(s3);
  const services = createServices({ config, logger, prisma, storage });
  const app = createApp({ config, logger, prisma, storage, services });
  return {
    app,
    config,
    prisma,
    s3,
    storage,
    services,
    logs,
    close: async () => {
      await prisma.$disconnect();
      s3.destroy();
    },
  };
}

/** Xoá dữ liệu giữa các test theo thứ tự FK (§A4.6). */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe('DELETE FROM storage_cleanup_tasks');
  await prisma.$executeRawUnsafe('DELETE FROM sessions');
  await prisma.$executeRawUnsafe('DELETE FROM documents');
  await prisma.$executeRawUnsafe('DELETE FROM users');
}

let counter = 0;
export function uniqueEmail(prefix = 'sv'): string {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@example.com`;
}

export interface TestUser {
  agent: request.Agent;
  id: string;
  email: string;
  displayName: string;
}

/** Đăng ký qua API-04 bằng agent giữ cookie. */
export async function registerUser(app: Express, displayName = 'Nguyễn Văn A', password = 'matkhau123'): Promise<TestUser> {
  const agent = request.agent(app);
  const email = uniqueEmail();
  const res = await agent.post('/api/auth/register').set(CSRF).send({ email, password, displayName });
  if (res.status !== 201) throw new Error(`Đăng ký thất bại: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, id: res.body.data.user.id as string, email, displayName };
}

export interface UploadOptions {
  title?: string;
  description?: string;
  visibility?: 'PUBLIC' | 'PRIVATE';
  file?: Buffer;
  filename?: string;
  contentType?: string;
}

export function uploadRequest(user: TestUser, options: UploadOptions = {}): request.Test {
  let req = user.agent.post('/api/documents').set(CSRF);
  if (options.title !== undefined) req = req.field('title', options.title);
  if (options.description !== undefined) req = req.field('description', options.description);
  if (options.visibility !== undefined) req = req.field('visibility', options.visibility);
  return req.attach('file', options.file ?? pdfBuffer(), {
    filename: options.filename ?? 'tai-lieu.pdf',
    contentType: options.contentType ?? 'application/pdf',
  });
}

/** Tải lên thành công và trả DocumentDto. */
export async function uploadDocument(user: TestUser, options: UploadOptions = {}): Promise<Record<string, unknown> & { id: string }> {
  const res = await uploadRequest(user, { title: 'Tài liệu mẫu', visibility: 'PUBLIC', ...options });
  if (res.status !== 201) throw new Error(`Upload thất bại: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function objectExists(s3: S3ObjectStorage, key: string): Promise<boolean> {
  try {
    const object = await s3.getObject(key);
    object.body.resume();
    return true;
  } catch (error) {
    if (error instanceof StorageError && error.kind === 'NOT_FOUND') return false;
    throw error;
  }
}

export async function readObject(s3: S3ObjectStorage, key: string): Promise<Buffer> {
  const object = await s3.getObject(key);
  const chunks: Buffer[] = [];
  for await (const chunk of object.body) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

/** Supertest: gom body nhị phân của API-13. */
export function binaryParser(res: request.Response, callback: (err: Error | null, body: Buffer) => void): void {
  const stream = res as unknown as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.concat(chunks)));
  stream.on('error', (err: Error) => callback(err, Buffer.alloc(0)));
}
