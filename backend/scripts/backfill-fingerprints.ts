import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../src/config/env.js';
import { createLogger } from '../src/lib/logger.js';
import { DuplicateRepository } from '../src/modules/duplicates/duplicate.repository.js';
import { DuplicateService } from '../src/modules/duplicates/duplicate.service.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';

/** Manual, single-document-at-a-time, idempotent backfill. Never deletes application data. */
export async function backfill(): Promise<{ processed: number; stale: number }> {
  const config = loadConfig();
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  const storage = new S3ObjectStorage(config.s3);
  const repository = new DuplicateRepository(prisma);
  const service = new DuplicateService(repository, 'warn', createLogger({ level: config.logLevel, instanceId: config.instanceId }));
  await mkdir(config.upload.tmpDir, { recursive: true });
  let cursor = '', processed = 0, stale = 0;
  try {
    while (true) {
      const candidates = await prisma.$queryRaw<Array<{ id: string; ownerId: string; storageKey: string; fileType: string; sizeBytes: number; visibility: 'PUBLIC' | 'PRIVATE' }>>`SELECT d.id, d.owner_id AS ownerId, d.storage_key AS storageKey, d.file_type AS fileType, d.size_bytes AS sizeBytes, d.visibility FROM documents d LEFT JOIN document_fingerprints f ON f.document_id=d.id WHERE d.id > ${cursor} AND (f.document_id IS NULL OR f.algo_version <> 1 OR f.file_version <> d.file_version OR f.text_reason IN ('DISABLED','BUSY','TIMEOUT')) ORDER BY d.id ASC LIMIT 1`;
      const doc = candidates[0]; if (!doc) break; cursor = doc.id;
      const dir = await mkdtemp(path.join(config.upload.tmpDir, 'fingerprint-backfill-'));
      const tmpPath = path.join(dir, 'document');
      try {
        const object = await storage.getObject(doc.storageKey); await pipeline(object.body, createWriteStream(tmpPath));
        const prepared = await service.prepare({ tmpPath, fileType: doc.fileType, sizeBytes: Number(doc.sizeBytes) }, doc.ownerId, doc.visibility, doc.id);
        const saved = await prisma.$transaction(async (db) => {
          const rows = await db.$queryRaw<Array<{ storageKey: string; fileVersion: number }>>`SELECT storage_key AS storageKey, file_version AS fileVersion FROM documents WHERE id=${doc.id} FOR UPDATE`;
          const current = rows[0]; if (!current || current.storageKey !== doc.storageKey) return false;
          await repository.save(db, doc.id, Number(current.fileVersion), prepared); return true;
        });
        if (saved) processed++; else stale++;
      } finally { await rm(dir, { recursive: true, force: true }); }
    }
    return { processed, stale };
  } finally { await prisma.$disconnect(); storage.destroy(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  backfill().then((result) => console.log(JSON.stringify(result))).catch(() => { console.error('Fingerprint backfill failed; no documents were deleted.'); process.exitCode = 1; });
}
