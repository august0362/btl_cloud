import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { loadConfig } from '../src/config/env.js';
import type { ObjectStorage } from '../src/storage/object-storage.js';
import { S3ObjectStorage } from '../src/storage/s3-object-storage.js';

const candidateSchema = z.object({
  privateId: z.string().uuid(), publicId: z.string().uuid(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  privateKey: z.string(), publicKey: z.string(),
  privateVersion: z.number().int().positive(), publicVersion: z.number().int().positive(),
}).strict();
const planSchema = z.object({
  policy: z.literal('private-exact-v1'), database: z.string(), storage: z.string(),
  candidates: z.array(candidateSchema),
}).strict();
export type PrivateDuplicatePlan = z.infer<typeof planSchema>;
type Candidate = z.infer<typeof candidateSchema>;

/** A plan contains internal IDs/keys, never credentials. Keep it in the ignored tmp directory. */
export async function planPrivateDuplicates(prisma: PrismaClient, database: string, storage = 'test'): Promise<PrivateDuplicatePlan> {
  const rows = await prisma.$queryRaw<Candidate[]>`
    SELECT d.id AS privateId, p.id AS publicId, f.sha256,
      d.storage_key AS privateKey, p.storage_key AS publicKey,
      d.file_version AS privateVersion, p.file_version AS publicVersion
    FROM documents d JOIN document_fingerprints f
      ON f.document_id=d.id AND f.file_version=d.file_version
    JOIN users owner ON owner.id=d.owner_id AND owner.deletion_started_at IS NULL
    JOIN document_fingerprints pf ON pf.sha256=f.sha256
    JOIN documents p ON p.id=pf.document_id AND p.file_version=pf.file_version
    JOIN users public_owner ON public_owner.id=p.owner_id AND public_owner.deletion_started_at IS NULL
    WHERE d.visibility='PRIVATE' AND p.visibility='PUBLIC'
    ORDER BY d.id, p.created_at ASC, p.id ASC`;
  const seen = new Set<string>();
  const candidates = rows.filter((row) => {
    if (seen.has(row.privateId)) return false;
    seen.add(row.privateId); return true;
  }).map((row) => ({ ...row, privateVersion: Number(row.privateVersion), publicVersion: Number(row.publicVersion) }));
  return planSchema.parse({ policy: 'private-exact-v1', database, storage, candidates });
}

async function storageHash(storage: ObjectStorage, key: string): Promise<string> {
  const object = await storage.getObject(key);
  const hash = createHash('sha256');
  for await (const chunk of object.body) hash.update(chunk);
  return hash.digest('hex');
}

/** Apply only a previously saved plan. Both objects and locked current metadata must still match. */
export async function applyPrivateDuplicatePlan(prisma: PrismaClient, storage: ObjectStorage, input: PrivateDuplicatePlan) {
  const plan = planSchema.parse(input);
  const result = { deleted: [] as string[], skipped: [] as string[], storageDeleteFailed: [] as string[] };
  for (const candidate of plan.candidates) {
    try {
      // A missing/corrupt public object is not a safe reason to discard a private copy.
      if (await storageHash(storage, candidate.publicKey) !== candidate.sha256 ||
          await storageHash(storage, candidate.privateKey) !== candidate.sha256) {
        result.skipped.push(candidate.privateId); continue;
      }
      const removed = await prisma.$transaction(async (db) => {
        const rows = await db.$queryRaw<Array<{
          id: string; visibility: string; storageKey: string; fileVersion: number | bigint;
          sha256: string; deletionStartedAt: Date | null;
        }>>`SELECT d.id, d.visibility, d.storage_key AS storageKey, d.file_version AS fileVersion,
            f.sha256, u.deletion_started_at AS deletionStartedAt
          FROM documents d JOIN document_fingerprints f
            ON f.document_id=d.id AND f.file_version=d.file_version
          JOIN users u ON u.id=d.owner_id
          WHERE d.id IN (${Prisma.join([candidate.privateId, candidate.publicId].sort())})
          ORDER BY d.id FOR UPDATE`;
        const privateDoc = rows.find((row) => row.id === candidate.privateId);
        const publicDoc = rows.find((row) => row.id === candidate.publicId);
        if (!privateDoc || !publicDoc || privateDoc.visibility !== 'PRIVATE' || publicDoc.visibility !== 'PUBLIC' ||
            privateDoc.deletionStartedAt || publicDoc.deletionStartedAt ||
            privateDoc.sha256 !== candidate.sha256 || publicDoc.sha256 !== candidate.sha256 ||
            privateDoc.storageKey !== candidate.privateKey || publicDoc.storageKey !== candidate.publicKey ||
            Number(privateDoc.fileVersion) !== candidate.privateVersion || Number(publicDoc.fileVersion) !== candidate.publicVersion) return false;
        await db.document.delete({ where: { id: candidate.privateId } });
        await db.auditEvent.create({ data: {
          createdAt: new Date(), actorType: 'DEVELOPER', actorId: null,
          action: 'DOCUMENT_DELETE', targetType: 'DOCUMENT', targetId: candidate.privateId,
          outcome: 'SUCCESS', metadata: { source: 'private-duplicate-cleanup', retainedPublicId: candidate.publicId, policy: plan.policy },
        } });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (!removed) { result.skipped.push(candidate.privateId); continue; }
      result.deleted.push(candidate.privateId);
      try { await storage.deleteObject(candidate.privateKey); }
      catch { result.storageDeleteFailed.push(candidate.privateId); }
    } catch {
      // Transaction errors roll back metadata; never delete the object without a committed deletion.
      result.skipped.push(candidate.privateId);
    }
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--apply' && !arg.startsWith('--plan='))) throw new Error('Use [--plan=tmp/plan.json] [--apply]');
  const apply = args.includes('--apply');
  const file = args.find((arg) => arg.startsWith('--plan='))?.slice('--plan='.length);
  if (apply && !file) throw new Error('--apply requires the previously reviewed --plan=... file');
  const config = loadConfig();
  const url = new URL(config.databaseUrl);
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!localHosts.has(url.hostname) || !config.s3.endpoint || !localHosts.has(new URL(config.s3.endpoint).hostname)) {
    throw new Error('Cleanup is restricted to local MySQL and local object storage');
  }
  const database = `${url.hostname}:${url.port || '3306'}${url.pathname}`;
  const storageIdentity = `${new URL(config.s3.endpoint).origin}/${config.s3.bucket}`;
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  const storage = new S3ObjectStorage(config.s3);
  try {
    if (!apply) {
      const plan = await planPrivateDuplicates(prisma, database, storageIdentity);
      const output = file ?? `tmp/private-duplicate-plan-${Date.now()}.json`;
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify(plan, null, 2), { flag: 'wx', mode: 0o600 });
      console.log(JSON.stringify({ dryRun: true, plan: output, count: plan.candidates.length,
        candidates: plan.candidates.map(({ privateId, publicId }) => ({ deletePrivate: privateId, keepPublic: publicId })) }));
    } else {
      const plan = planSchema.parse(JSON.parse(await readFile(file!, 'utf8')));
      if (plan.database !== database || plan.storage !== storageIdentity) throw new Error('Plan belongs to a different database');
      const result = await applyPrivateDuplicatePlan(prisma, storage, plan);
      console.log(JSON.stringify(result));
      if (result.storageDeleteFailed.length) process.exitCode = 2;
    }
  } finally { await prisma.$disconnect(); storage.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Cleanup failed. Review the plan, configuration and service availability.'); process.exitCode = 1; });
}
