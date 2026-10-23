import { StorageError, type ObjectStorage, type PutObjectInput, type StoredObject } from '../../src/storage/object-storage.js';

/**
 * Bọc storage thật (SeaweedFS/MinIO/S3) để giả lập lỗi trong integration test (§M2-07, §M2-11, §M2-12).
 * `afterPut` chạy SAU khi PutObject thành công — dùng để gây lỗi DB/xung đột ngay trước bước COMMIT.
 */
export class FaultInjectingStorage implements ObjectStorage {
  failPut = 0;
  failGet = 0;
  failDelete = 0;
  failHealth = 0;
  afterPut: ((key: string) => Promise<void>) | undefined;
  readonly putKeys: string[] = [];

  constructor(readonly inner: ObjectStorage) {}

  reset(): void {
    this.failPut = 0;
    this.failGet = 0;
    this.failDelete = 0;
    this.failHealth = 0;
    this.afterPut = undefined;
    this.putKeys.length = 0;
  }

  private consume(counter: 'failPut' | 'failGet' | 'failDelete' | 'failHealth'): void {
    if (this[counter] > 0) {
      this[counter] -= 1;
      throw new StorageError('UNAVAILABLE', `Giả lập lỗi storage (${counter})`);
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    this.consume('failPut');
    await this.inner.putObject(input);
    this.putKeys.push(input.key);
    if (this.afterPut) {
      const hook = this.afterPut;
      this.afterPut = undefined;
      await hook(input.key);
    }
  }

  async getObject(key: string): Promise<StoredObject> {
    this.consume('failGet');
    return this.inner.getObject(key);
  }

  async deleteObject(key: string): Promise<void> {
    this.consume('failDelete');
    return this.inner.deleteObject(key);
  }

  async checkHealth(): Promise<void> {
    this.consume('failHealth');
    return this.inner.checkHealth();
  }
}
