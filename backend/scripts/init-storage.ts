/**
 * Tạo bucket cho môi trường local/test (`npm run storage:init`). Không dùng trên AWS — bucket S3 do M5 tạo.
 * Mặc định tạo S3_BUCKET và S3_BUCKET + "-test"; truyền tên bucket làm tham số để tạo bucket khác.
 */
import { loadConfig } from '../src/config/env.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';

const config = loadConfig();
const buckets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : [config.s3.bucket, `${config.s3.bucket}-test`];

for (const bucket of buckets) {
  const storage = new S3ObjectStorage({ ...config.s3, bucket });
  try {
    const result = await storage.ensureBucket();
    console.log(`${bucket}: ${result === 'created' ? 'đã tạo' : 'đã tồn tại'}`);
  } finally {
    storage.destroy();
  }
}
