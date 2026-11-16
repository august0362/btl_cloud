export const DUPLICATE_POLICY = { algorithmVersion: 1, shingleWords: 5, signatureLength: 128, prime: 2147483647, maxWords: 20000, minWords: 50, pdfMaxBytes: 10 * 1024 * 1024, maxPages: 100, maxParts: 300, partBytes: 10 * 1024 * 1024, totalBytes: 32 * 1024 * 1024, deadlineMs: 15000, queueSize: 3, candidates: 2000 } as const;
export const NEAR_THRESHOLD = 0.7;
export const BLOCK_THRESHOLD = 0.9;
export type TextReason = 'WORD_LIMIT' | 'PAGE_LIMIT' | 'PART_LIMIT' | 'DISABLED' | 'TOO_LARGE' | 'ENCRYPTED' | 'MALFORMED' | 'INSUFFICIENT_TEXT' | 'TIMEOUT' | 'BUSY' | 'UNSUPPORTED' | 'ERROR';
export interface TextFingerprint {
    status: 'OK' | 'PARTIAL' | 'SKIPPED';
    reason: TextReason | null;
    shingleCount: number | null;
    minhash: Uint8Array | null;
    textSha256: string | null;
}
export const skipped = (reason: TextReason): TextFingerprint => ({ status: 'SKIPPED', reason, shingleCount: null, minhash: null, textSha256: null });
