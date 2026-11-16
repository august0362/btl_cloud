import { createHash } from 'node:crypto';
import { tokenize } from '../../lib/text-normalize.js';
import { DUPLICATE_POLICY as P, skipped, type TextFingerprint, type TextReason } from './duplicate.policy.js';
const u32 = (text: string) => createHash('sha256').update(text).digest().readUInt32BE(0);
export const MINHASH_COEFFICIENTS = Array.from({ length: P.signatureLength }, (_, i) => [u32(`btl-minhash-v1:a:${i}`) % (P.prime - 1) + 1, u32(`btl-minhash-v1:b:${i}`) % P.prime] as const);
export function mulAddMod(a: number, x: number, b: number): number {
    const hi = ((Math.floor(a / 65536) * x) % P.prime) * 65536 % P.prime;
    return (hi + (a % 65536) * x + b) % P.prime;
}
export function signatureForShingles(shingles: Iterable<string>): Buffer {
    const signature = Array<number>(P.signatureLength).fill(P.prime);
    for (const shingle of shingles) {
        const x = u32(shingle) % P.prime;
        MINHASH_COEFFICIENTS.forEach(([a, b], i) => { signature[i] = Math.min(signature[i]!, mulAddMod(a, x, b)); });
    }
    const bytes = Buffer.alloc(512);
    signature.forEach((n, i) => bytes.writeUInt32BE(n, i * 4));
    return bytes;
}
export function fingerprintText(text: string, partialReason: TextReason | null = null): TextFingerprint {
    const { tokens, truncated } = tokenize(text, { maxTokens: P.maxWords });
    if (tokens.length < P.minWords)
        return skipped('INSUFFICIENT_TEXT');
    const shingles = new Set<string>();
    for (let i = 0; i <= tokens.length - P.shingleWords; i++)
        shingles.add(tokens.slice(i, i + P.shingleWords).join(' '));
    const reason = truncated ? 'WORD_LIMIT' : partialReason;
    return { status: reason ? 'PARTIAL' : 'OK', reason, shingleCount: shingles.size, minhash: signatureForShingles(shingles), textSha256: reason ? null : createHash('sha256').update(tokens.join(' ')).digest('hex') };
}
export function estimate(a: Uint8Array, b: Uint8Array): number {
    if (a.length !== 512 || b.length !== 512)
        throw new RangeError('Invalid MinHash signature');
    const left = Buffer.from(a), right = Buffer.from(b);
    let equal = 0;
    for (let i = 0; i < 128; i++)
        if (left.readUInt32BE(i * 4) === right.readUInt32BE(i * 4))
            equal++;
    return equal / 128;
}
