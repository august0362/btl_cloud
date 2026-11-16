import { AppError } from '../../http/errors.js';
import { Prisma, type PrismaClient, type Visibility } from '@prisma/client';
import { duplicateScopeSql } from '../documents/document.scope.js';
import { estimate } from './minhash.js';
import { DUPLICATE_POLICY as P, NEAR_THRESHOLD } from './duplicate.policy.js';
import type { DuplicateMatchDto, PreparedFingerprint } from './duplicate.service.js';
interface MatchRow {
    id: string;
    title: string;
    visibility: Visibility;
    ownerId: string;
    minhash?: Uint8Array;
}
export class DuplicateRepository {
    constructor(private readonly prisma: PrismaClient) { }
    private match(row: MatchRow, ownerId: string, matchType: DuplicateMatchDto['matchType'], similarity: number): DuplicateMatchDto {
        return { documentId: row.id, title: row.title, visibility: row.visibility, ownedByYou: row.ownerId === ownerId, matchType, similarity: Math.round(similarity * 100) / 100 };
    }
    async exact(sha256: string, ownerId: string, excludeId?: string, db: Prisma.TransactionClient = this.prisma): Promise<DuplicateMatchDto[]> {
        const rows = await db.$queryRaw<MatchRow[]> `SELECT d.id, d.title, d.visibility, d.owner_id AS ownerId FROM document_fingerprints f JOIN documents d ON d.id=f.document_id AND d.file_version=f.file_version WHERE f.sha256=${sha256} AND ${duplicateScopeSql(ownerId)} AND d.id <> ${excludeId ?? ''} ORDER BY (d.owner_id=${ownerId}) DESC, d.created_at DESC, d.id DESC LIMIT 5`;
        return rows.map((r) => this.match(r, ownerId, 'EXACT', 1));
    }
    async textMatches(text: PreparedFingerprint['text'], ownerId: string, excludeId?: string): Promise<{
        textMatches: DuplicateMatchDto[];
        candidatesScanned: number;
        candidatesTruncated: boolean;
    }> {
        let textMatches: DuplicateMatchDto[] = [];
        if (text.textSha256) {
            const rows = await this.prisma.$queryRaw<MatchRow[]> `SELECT d.id, d.title, d.visibility, d.owner_id AS ownerId FROM document_fingerprints f JOIN documents d ON d.id=f.document_id AND d.file_version=f.file_version WHERE f.text_sha256=${text.textSha256} AND f.text_status='OK' AND f.algo_version=${P.algorithmVersion} AND ${duplicateScopeSql(ownerId)} AND d.id <> ${excludeId ?? ''} ORDER BY (d.owner_id=${ownerId}) DESC, d.created_at DESC, d.id DESC LIMIT 5`;
            textMatches = rows.map((r) => this.match(r, ownerId, 'SAME_TEXT', 1));
        }
        const candidates = await this.prisma.$queryRaw<MatchRow[]> `SELECT d.id, d.title, d.visibility, d.owner_id AS ownerId, f.minhash FROM document_fingerprints f JOIN documents d ON d.id=f.document_id AND d.file_version=f.file_version WHERE f.algo_version=${P.algorithmVersion} AND f.text_status IN ('OK','PARTIAL') AND f.shingle_count BETWEEN ${Math.ceil(text.shingleCount! * 0.5)} AND ${Math.floor(text.shingleCount! / 0.5)} AND ${duplicateScopeSql(ownerId)} AND d.id <> ${excludeId ?? ''} ORDER BY d.created_at DESC,d.id DESC LIMIT 2001`;
        const candidatesTruncated = candidates.length > P.candidates;
        const candidatesScanned = Math.min(candidates.length, P.candidates);
        const sameIds = new Set(textMatches.map((m) => m.documentId));
        const near = candidates.slice(0, P.candidates).flatMap((r) => { if (!r.minhash || sameIds.has(r.id))
            return []; const similarity = estimate(text.minhash!, r.minhash); return similarity >= NEAR_THRESHOLD ? [this.match(r, ownerId, 'SIMILAR_TEXT', similarity)] : []; }).sort((a, b) => b.similarity - a.similarity);
        textMatches = [...textMatches, ...near].slice(0, 5);
        return { textMatches, candidatesScanned, candidatesTruncated };
    }
    async commit<T>(ownerId: string, visibility: Visibility, prepared: PreparedFingerprint, excludeId: string | undefined, mode: 'off' | 'warn' | 'block', block: (matches: DuplicateMatchDto[], visibility: Visibility) => void, write: (db: Prisma.TransactionClient) => Promise<{
        documentId: string;
        fileVersion: number;
        result: T;
    }>): Promise<T> {
        return this.prisma.$transaction(async (db) => {
            if (mode === 'block')
                await db.$queryRaw `SELECT id FROM users WHERE id=${ownerId} FOR UPDATE`;
            // Lock the replacement row too: a concurrent metadata PATCH must not change the
            // visibility between the blocking decision and the actual file update.
            let currentVisibility = visibility;
            if (excludeId) {
                const current = await db.$queryRaw<Array<{
                    visibility: Visibility;
                }>> `SELECT visibility FROM documents WHERE id=${excludeId} FOR UPDATE`;
                if (!current[0])
                    throw new AppError('DOCUMENT_NOT_FOUND', { stage: 'db' });
                currentVisibility = current[0].visibility;
            }
            if (mode === 'block')
                block(await this.exact(prepared.sha256, ownerId, excludeId, db), currentVisibility);
            const { documentId, fileVersion, result } = await write(db);
            await this.save(db, documentId, fileVersion, prepared);
            return result;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    }
    async save(db: Prisma.TransactionClient, documentId: string, fileVersion: number, prepared: PreparedFingerprint): Promise<void> {
        const data = { fileVersion, sha256: prepared.sha256, algoVersion: P.algorithmVersion, textStatus: prepared.text.status, textReason: prepared.text.reason, textSha256: prepared.text.textSha256, shingleCount: prepared.text.shingleCount, minhash: prepared.text.minhash ? Buffer.from(prepared.text.minhash) : null };
        await db.documentFingerprint.upsert({ where: { documentId }, create: { documentId, ...data }, update: data });
    }
}
