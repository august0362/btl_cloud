import { createReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { StorageError, type ObjectStorage, type PutObjectInput, type StoredObject } from './object-storage.js';

export interface S3StorageOptions {
  bucket: string;
  region: string;
  endpoint?: string | undefined;
  forcePathStyle: boolean;
}

const PART_SIZE = 8 * 1024 * 1024;
const HEALTH_TIMEOUT_MS = 2_000;

function isNotFound(error: unknown): boolean {
  if (error instanceof S3ServiceException) {
    return error.name === 'NoSuchKey' || error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404;
  }
  return false;
}

/**
 * Adapter duy nhất cho mọi storage S3-compatible (D-05, NFR-POR-01).
 * Credentials lấy theo default provider chain: biến môi trường ở local, IAM Role (IMDSv2) trên EC2.
 */
export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(options: S3StorageOptions) {
    this.bucket = options.bucket;
    this.client = new S3Client({
      region: options.region,
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle,
      maxAttempts: 2,
      // Emulator S3 (SeaweedFS…) không hỗ trợ đầy đủ checksum trailer mặc định của SDK mới.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      requestHandler: new NodeHttpHandler({ connectionTimeout: 3_000, requestTimeout: 60_000 }),
    });
  }

  async putObject(input: PutObjectInput): Promise<void> {
    try {
      // Multipart theo phần 8 MB, tối đa 2 phần song song → không đệm cả tệp trong RAM (NFR-SCL-03).
      const upload = new Upload({
        client: this.client,
        params: { Bucket: this.bucket, Key: input.key, Body: createReadStream(input.filePath), ContentType: input.contentType },
        partSize: PART_SIZE,
        queueSize: 2,
        leavePartsOnError: false,
      });
      await upload.done();
    } catch (error) {
      throw new StorageError('UNAVAILABLE', `PutObject thất bại cho ${input.key}`, { cause: error });
    }
  }

  async getObject(key: string): Promise<StoredObject> {
    try {
      const response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!response.Body) throw new StorageError('UNAVAILABLE', `GetObject không có body cho ${key}`);
      return { body: response.Body as Readable, contentLength: Number(response.ContentLength ?? 0) };
    } catch (error) {
      if (error instanceof StorageError) throw error;
      if (isNotFound(error)) throw new StorageError('NOT_FOUND', `Object ${key} không tồn tại`, { cause: error });
      throw new StorageError('UNAVAILABLE', `GetObject thất bại cho ${key}`, { cause: error });
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isNotFound(error)) return;
      throw new StorageError('UNAVAILABLE', `DeleteObject thất bại cho ${key}`, { cause: error });
    }
  }

  async checkHealth(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }), {
        abortSignal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
    } catch (error) {
      throw new StorageError('UNAVAILABLE', `HeadBucket thất bại cho ${this.bucket}`, { cause: error });
    }
  }

  /** Chỉ dùng cho môi trường local/test (`npm run storage:init`, global setup của test). */
  async ensureBucket(): Promise<'created' | 'exists'> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return 'exists';
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
    await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    return 'created';
  }

  destroy(): void {
    this.client.destroy();
  }
}
