import type { Readable } from 'node:stream';

/** Interface storage dùng chung cho MinIO/SeaweedFS (local) và Amazon S3 (§A3.2.4, §A6.2). */
export interface PutObjectInput {
  key: string;
  filePath: string;
  contentType: string;
  contentLength: number;
}

export interface StoredObject {
  body: Readable;
  contentLength: number;
}

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<StoredObject>;
  /** Idempotent: key không tồn tại vẫn coi là thành công. */
  deleteObject(key: string): Promise<void>;
  checkHealth(): Promise<void>;
}

export type StorageErrorKind = 'UNAVAILABLE' | 'NOT_FOUND';

export class StorageError extends Error {
  constructor(
    readonly kind: StorageErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'StorageError';
  }
}
