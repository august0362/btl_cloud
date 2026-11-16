import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import type { Visibility } from '@prisma/client';
import { DuplicateRepository } from './duplicate.repository.js';
import { AppError } from '../../http/errors.js';
import type { Logger } from '../../lib/logger.js';
import { BLOCK_THRESHOLD, skipped, type TextFingerprint } from './duplicate.policy.js';
import { TextWorkerPool } from './text-worker-pool.js';
export interface DuplicateMatchDto {
    documentId: string;
    title: string;
    visibility: Visibility;
    ownedByYou: boolean;
    matchType: 'EXACT' | 'SAME_TEXT' | 'SIMILAR_TEXT';
    similarity: number;
}
export interface DuplicateCheckDto {
    mode: 'off' | 'warn' | 'block';
    result: 'ACCEPT' | 'WARNING';
    exactMatches: DuplicateMatchDto[];
    textMatches: DuplicateMatchDto[];
    textAnalysis: {
        status: TextFingerprint['status'];
        reason: string | null;
        candidatesScanned: number;
        candidatesTruncated: boolean;
    };
}
export interface PreparedFingerprint {
    sha256: string;
    text: TextFingerprint;
    check: DuplicateCheckDto;
}
export async function sha256File(path: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path))
        hash.update(chunk);
    return hash.digest('hex');
}
export class DuplicateService {
    private readonly pool = new TextWorkerPool();
    constructor(private readonly repository: DuplicateRepository, readonly mode: 'off' | 'warn' | 'block', private readonly logger: Logger) { }
    block(matches: DuplicateMatchDto[], _visibility: Visibility): void {
        if (this.mode !== 'block')
            return;
        // Neither incoming visibility nor the match layer may bypass the rejection threshold.
        // Other users' private files remain outside the repository's comparison scope.
        const duplicates = matches.filter((m) => m.similarity > BLOCK_THRESHOLD && (m.ownedByYou || m.visibility === 'PUBLIC'));
        if (duplicates.length) {
            this.logger.info({ event: 'duplicates.blocked', documentId: duplicates[0]!.documentId }, 'Duplicate blocked');
            throw new AppError('DUPLICATE_DOCUMENT', { duplicates });
        }
    }
    async prepare(file: {
        tmpPath: string;
        fileType: string;
        sizeBytes: number;
    }, ownerId: string, visibility: Visibility, excludeId?: string): Promise<PreparedFingerprint> {
        const started = performance.now();
        let sha256: string;
        try {
            sha256 = await sha256File(file.tmpPath);
        }
        catch (cause) {
            throw new AppError('INTERNAL_ERROR', { cause, stage: 'inspect' });
        }
        let exactMatches: DuplicateMatchDto[] = [];
        if (this.mode !== 'off') {
            try {
                exactMatches = await this.repository.exact(sha256, ownerId, excludeId);
            }
            catch (cause) {
                throw new AppError('INTERNAL_ERROR', { cause, stage: 'db' });
            }
            this.block(exactMatches, visibility);
        }
        let text = this.mode === 'off' ? skipped('DISABLED') : await this.pool.analyze(file.tmpPath, file.fileType, file.sizeBytes).catch(() => skipped('ERROR'));
        if (this.mode === 'block' && text.status === 'SKIPPED' && ['BUSY', 'TIMEOUT', 'ERROR'].includes(text.reason!)) {
            // Temporary analysis failure must not be a way around mandatory rejection.
            throw new AppError('SERVICE_UNAVAILABLE', { stage: 'inspect' });
        }
        let textMatches: DuplicateMatchDto[] = [], candidatesScanned = 0, candidatesTruncated = false;
        try {
            if (text.minhash) {
                ({ textMatches, candidatesScanned, candidatesTruncated } = await this.repository.textMatches(text, ownerId, excludeId));
            }
        }
        catch (cause) {
            if (this.mode === 'block') throw new AppError('SERVICE_UNAVAILABLE', { cause, stage: 'db' });
            text = skipped('ERROR');
            textMatches = [];
            candidatesScanned = 0;
            candidatesTruncated = false;
        }
        this.block(textMatches, visibility);
        if (this.mode === 'block' && candidatesTruncated) throw new AppError('SERVICE_UNAVAILABLE', { stage: 'db' });
        if (text.status === 'SKIPPED') {
            const fields = { event: 'duplicates.text_skipped', reason: text.reason, fileType: file.fileType, sizeBytes: file.sizeBytes };
            if (['TIMEOUT', 'BUSY', 'ERROR'].includes(text.reason!))
                this.logger.warn(fields, 'Text analysis skipped');
            else
                this.logger.debug(fields, 'Text analysis skipped');
        }
        const check: DuplicateCheckDto = { mode: this.mode, result: exactMatches.length || textMatches.length ? 'WARNING' : 'ACCEPT', exactMatches, textMatches, textAnalysis: { status: text.status, reason: text.reason, candidatesScanned, candidatesTruncated } };
        this.logger.info({ event: 'duplicates.check', mode: this.mode, result: check.result, exactCount: exactMatches.length, textCount: textMatches.length, textStatus: text.status, textReason: text.reason, candidatesScanned, durationMs: performance.now() - started }, 'Duplicate check');
        return { sha256, text, check };
    }
    async commit<T>(ownerId: string, visibility: Visibility, prepared: PreparedFingerprint, excludeId: string | undefined, write: (db: import('@prisma/client').Prisma.TransactionClient) => Promise<{
        documentId: string;
        fileVersion: number;
        result: T;
    }>): Promise<T> {
        return this.repository.commit(ownerId, visibility, prepared, excludeId, this.mode, (matches, nextVisibility) => this.block(matches, nextVisibility), write);
    }
}
