import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { StorageError, type ObjectStorage, type PutObjectInput, type StoredObject } from './object-storage.js';

type Operation = 'put' | 'get' | 'delete' | 'health';

/** Storage trong bộ nhớ cho unit test; `failNext(op)` giả lập lỗi storage (§A3.6). */
export class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { data: Buffer; contentType: string }>();
  private readonly pendingFailures = new Map<Operation, number>();

  failNext(operation: Operation, times = 1): void {
    this.pendingFailures.set(operation, (this.pendingFailures.get(operation) ?? 0) + times);
  }

  private maybeFail(operation: Operation): void {
    const remaining = this.pendingFailures.get(operation) ?? 0;
    if (remaining > 0) {
      this.pendingFailures.set(operation, remaining - 1);
      throw new StorageError('UNAVAILABLE', `Giả lập lỗi storage (${operation})`);
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    this.maybeFail('put');
    this.objects.set(input.key, { data: await readFile(input.filePath), contentType: input.contentType });
  }

  async getObject(key: string): Promise<StoredObject> {
    this.maybeFail('get');
    const object = this.objects.get(key);
    if (!object) throw new StorageError('NOT_FOUND', `Object ${key} không tồn tại`);
    return { body: Readable.from(object.data), contentLength: object.data.length };
  }

  async deleteObject(key: string): Promise<void> {
    this.maybeFail('delete');
    this.objects.delete(key);
  }

  async checkHealth(): Promise<void> {
    this.maybeFail('health');
  }
}
