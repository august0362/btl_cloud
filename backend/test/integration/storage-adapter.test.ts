import { afterAll, describe, expect, it } from 'vitest';
import { StorageError } from '../../src/storage/object-storage.js';
import { S3ObjectStorage } from '../../src/storage/s3-object-storage.js';
import { TEST_ENV } from '../helpers/config.js';
import { pdfOfSize, sha256, writeTempFile } from '../helpers/fixtures.js';

/** M1-06: S3ObjectStorage chạy trên storage S3-compatible thật (SeaweedFS local; S3 trên AWS). */
const options = { region: TEST_ENV.S3_REGION, endpoint: TEST_ENV.S3_ENDPOINT, forcePathStyle: true };
const storage = new S3ObjectStorage({ ...options, bucket: TEST_ENV.S3_BUCKET });
// Tên ngẫu nhiên mỗi lần chạy: không dùng lại bucket có thể đã bị emulator tạo ngầm.
const wrongBucket = new S3ObjectStorage({ ...options, bucket: `khong-ton-tai-${Date.now()}` });

afterAll(() => {
  storage.destroy();
  wrongBucket.destroy();
});

async function readAll(key: string): Promise<{ data: Buffer; contentLength: number }> {
  const object = await storage.getObject(key);
  const chunks: Buffer[] = [];
  for await (const chunk of object.body) chunks.push(Buffer.from(chunk as Buffer));
  return { data: Buffer.concat(chunks), contentLength: object.contentLength };
}

async function expectStorageError(promise: Promise<unknown>, kind: 'UNAVAILABLE' | 'NOT_FOUND') {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(StorageError);
  expect((error as StorageError).kind).toBe(kind);
}

describe('S3ObjectStorage', () => {
  it('put (multipart 20 MB) → get đúng byte và ContentLength → delete → delete lần 2 không lỗi → get NOT_FOUND', async () => {
    const data = pdfOfSize(20 * 1024 * 1024 + 123);
    const key = `documents/adapter-test/${Date.now()}.pdf`;
    await storage.putObject({ key, filePath: await writeTempFile('big.pdf', data), contentType: 'application/pdf', contentLength: data.length });
    const read = await readAll(key);
    expect(read.contentLength).toBe(data.length);
    expect(sha256(read.data)).toBe(sha256(data));
    await storage.deleteObject(key);
    await storage.deleteObject(key);
    await expectStorageError(storage.getObject(key), 'NOT_FOUND');
  });

  it('checkHealth OK với bucket đúng; bucket sai → StorageError UNAVAILABLE', async () => {
    await expect(storage.checkHealth()).resolves.toBeUndefined();
    await expectStorageError(wrongBucket.checkHealth(), 'UNAVAILABLE');
    // Không kiểm PutObject vào bucket sai: SeaweedFS (danh tính Admin) tự tạo bucket, khác S3 thật (NoSuchBucket).
  });

  it('endpoint không phản hồi → UNAVAILABLE (không treo)', async () => {
    const dead = new S3ObjectStorage({ ...options, endpoint: 'http://127.0.0.1:9', bucket: TEST_ENV.S3_BUCKET });
    try {
      const started = Date.now();
      await expectStorageError(dead.checkHealth(), 'UNAVAILABLE');
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      dead.destroy();
    }
  });
});
