// XM-12 (E3-03): seed dữ liệu thử tải vào DB `btl_cloud_load` + bucket `btl-cloud-documents-load`.
// Chạy hai lần không lỗi (upsert theo id cố định). Từ chối nếu DB/bucket khác hoặc không phải loopback.
// Hướng dẫn: scripts/load/README.md.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');
const { S3Client, CreateBucketCommand, HeadBucketCommand, HeadObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const DB_NAME = 'btl_cloud_load';
const BUCKET = 'btl-cloud-documents-load';
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const USERS = 50;
const DOCUMENTS = 500;
const PASSWORD = 'matkhau123';
const TOPICS = ['Giải tích', 'Đại số tuyến tính', 'Bài giải Vật lý', 'Lập trình C', 'Cơ sở dữ liệu', 'Điện toán đám mây', 'Mạng máy tính', 'Giải thuật', 'Xác suất thống kê', 'Hệ điều hành'];

function refuse(message) {
  console.error(`Từ chối seed: ${message}`);
  process.exit(1);
}

const dbUrl = (() => { try { return new URL(process.env.DATABASE_URL ?? ''); } catch { return null; } })();
if (!dbUrl || dbUrl.pathname !== `/${DB_NAME}`) refuse(`DATABASE_URL phải trỏ tới DB ${DB_NAME}.`);
if (!LOOPBACK.has(dbUrl.hostname)) refuse('DATABASE_URL phải là loopback (localhost/127.0.0.1).');
if (process.env.S3_BUCKET !== BUCKET) refuse(`S3_BUCKET phải là ${BUCKET}.`);
const endpoint = (() => { try { return new URL(process.env.S3_ENDPOINT ?? ''); } catch { return null; } })();
if (!endpoint || !LOOPBACK.has(endpoint.hostname)) refuse('S3_ENDPOINT phải là loopback.');

// Id cố định → chạy lại là upsert, không nhân đôi.
const uuid = (kind, index) => `00000000-0000-4000-${kind === 'user' ? '8000' : '9000'}-${String(index).padStart(12, '0')}`;
const emailOf = (index) => `load-user-${String(index).padStart(2, '0')}@example.com`;
const SMALL = Buffer.from('%PDF-1.4\n% du lieu thu tai\n%%EOF\n');
const LARGE = Buffer.alloc(1024 * 1024, 0x41);
LARGE.write('%PDF-1.4\n', 0);

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl.toString() } } });
const s3 = new S3Client({ region: process.env.S3_REGION ?? 'us-east-1', endpoint: endpoint.toString(), forcePathStyle: true });

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  }
}

async function putOnce(key, body) {
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    if (head.ContentLength === body.length) return;
  } catch {
    // chưa có → tải lên
  }
  await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: 'application/pdf', ContentLength: body.length }));
}

try {
  await ensureBucket();
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
  for (let i = 1; i <= USERS; i += 1) {
    const data = { email: emailOf(i), passwordHash, displayName: `Người thử tải ${i}`, deletionStartedAt: null };
    await prisma.user.upsert({ where: { id: uuid('user', i) }, create: { id: uuid('user', i), ...data }, update: data });
  }
  const now = new Date();
  for (let i = 1; i <= DOCUMENTS; i += 1) {
    // Tài liệu số 1 là tệp 1 MiB Public cho kịch bản tải xuống; còn lại tệp nhỏ, 4/5 Public.
    const body = i === 1 ? LARGE : SMALL;
    const id = uuid('doc', i);
    const storageKey = `documents/load/${id}`;
    await putOnce(storageKey, body);
    const data = {
      ownerId: uuid('user', ((i - 1) % USERS) + 1), title: `${TOPICS[i % TOPICS.length]} ${i}`, description: `Tài liệu thử tải số ${i}`,
      visibility: i === 1 || i % 5 !== 0 ? 'PUBLIC' : 'PRIVATE', fileType: 'PDF', mimeType: 'application/pdf',
      originalFilename: `tai-lieu-${i}.pdf`, sizeBytes: body.length, storageKey, fileUpdatedAt: now,
    };
    await prisma.document.upsert({ where: { id }, create: { id, ...data }, update: data });
  }
  console.log(`Seed xong: ${USERS} user (mật khẩu ${PASSWORD}), ${DOCUMENTS} tài liệu. Tài liệu 1 MiB: ${uuid('doc', 1)}`);
} finally {
  await prisma.$disconnect();
  s3.destroy();
}
