import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';
import { tokenize } from '../../lib/text-normalize.js';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import { DUPLICATE_POLICY as P, skipped, type TextFingerprint, type TextReason } from './duplicate.policy.js';
import { fingerprintText } from './minhash.js';
function decodeXml(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_all, entity: string) => {
        const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
        if (entity.startsWith('#')) {
            const n = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
            return n <= 0x10ffff && n >= 0 ? String.fromCodePoint(n) : ' ';
        }
        return named[entity.toLowerCase()] ?? ' ';
    });
}
function xmlText(xml: string, partial: boolean): string {
    if (!partial) {
        const stack: string[] = [];
        const cleaned = xml.replace(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>/g, '');
        const tags = cleaned.match(/<[^>]*>/g) ?? [];
        if (!tags.length || cleaned.replace(/<[^>]*>/g, '').includes('<'))
            throw new Error('MALFORMED');
        for (const tag of tags) {
            if (tag.startsWith('<!'))
                throw new Error('MALFORMED');
            const name = /^<\/?([\w:.-]+)(?:\s|\/?>)/.exec(tag)?.[1];
            if (!name)
                throw new Error('MALFORMED');
            if (tag.startsWith('</')) {
                if (stack.pop() !== name)
                    throw new Error('MALFORMED');
            }
            else if (!tag.endsWith('/>'))
                stack.push(name);
        }
        if (stack.length)
            throw new Error('MALFORMED');
    }
    const pieces: string[] = [];
    for (const match of xml.matchAll(/<(?:w|a):t\b[^>]*>([\s\S]*?)<\/(?:w|a):t>|<\/(?:w|a):p\s*>|<w:(?:tab|br)\b[^>]*\/>/g)) {
        pieces.push(match[1] === undefined ? ' ' : decodeXml(match[1]));
    }
    return pieces.join('');
}
async function office(path: string, fileType: string): Promise<TextFingerprint> {
    const zip = await new Promise<ZipFile>((resolve, reject) => yauzl.open(path, { lazyEntries: true, autoClose: false }, (error, z) => error || !z ? reject(error) : resolve(z)));
    try {
        const entries: Entry[] = await new Promise((resolve, reject) => {
            const found: Entry[] = [];
            zip.on('error', reject);
            zip.on('entry', (entry: Entry) => { if (fileType === 'DOCX' ? entry.fileName === 'word/document.xml' : /^ppt\/slides\/slide\d+\.xml$/.test(entry.fileName))
                found.push(entry); zip.readEntry(); });
            zip.once('end', () => resolve(found));
            zip.readEntry();
        });
        entries.sort((a, b) => Number(a.fileName.match(/slide(\d+)/)?.[1] ?? 0) - Number(b.fileName.match(/slide(\d+)/)?.[1] ?? 0));
        let total = 0, reason: TextReason | null = entries.length > P.maxParts ? 'PART_LIMIT' : null;
        const text: string[] = [];
        for (const entry of entries.slice(0, P.maxParts)) {
            if (entry.generalPurposeBitFlag & 1)
                return skipped('ENCRYPTED');
            const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => zip.openReadStream(entry, (error, s) => error || !s ? reject(error) : resolve(s)));
            const chunks: Buffer[] = [];
            let count = 0;
            for await (const raw of stream) {
                const chunk = Buffer.from(raw as Uint8Array);
                const take = Math.max(0, Math.min(chunk.length, P.partBytes - count, P.totalBytes - total));
                chunks.push(chunk.subarray(0, take));
                count += take;
                total += take;
                if (take < chunk.length || count >= P.partBytes || total >= P.totalBytes) {
                    reason = 'PART_LIMIT';
                    (stream as import('node:stream').Readable).destroy();
                    break;
                }
            }
            text.push(xmlText(Buffer.concat(chunks).toString('utf8'), reason === 'PART_LIMIT'));
            if (tokenize(text.join(' '), { maxTokens: P.maxWords }).truncated) {
                reason = 'WORD_LIMIT';
                break;
            }
            if (count >= P.partBytes || total >= P.totalBytes)
                break;
        }
        return fingerprintText(text.join(' '), reason);
    }
    finally {
        zip.close();
    }
}
export async function extractFingerprint(path: string, fileType: string, sizeBytes: number): Promise<TextFingerprint> {
    try {
        if (fileType !== 'PDF')
            return await office(path, fileType);
        if (sizeBytes > P.pdfMaxBytes)
            return skipped('TOO_LARGE');
        // pdfjs opportunistically loads its optional renderer even for text extraction.
        // A synchronous resolution hook confines this worker to parser-only operation.
        const canvasGuard = registerHooks({ resolve(specifier, context, nextResolve) {
                if (specifier === '@napi-rs/canvas' || specifier.startsWith('@napi-rs/canvas-'))
                    throw new Error('Native canvas is disabled for text extraction');
                return nextResolve(specifier, context);
            } });
        try {
            let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs');
            try {
                pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
            }
            catch {
                return skipped('UNSUPPORTED');
            }
            const options: Parameters<typeof pdfjs.getDocument>[0] & {
                isEvalSupported: false;
            } = { data: new Uint8Array(await readFile(path)), isEvalSupported: false, disableFontFace: true, useSystemFonts: false };
            const task = pdfjs.getDocument(options);
            try {
                const pdf = await task.promise;
                const text: string[] = [];
                for (let n = 1; n <= Math.min(pdf.numPages, P.maxPages); n++) {
                    const page = await pdf.getPage(n);
                    const content = await page.getTextContent();
                    text.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '));
                    page.cleanup();
                    if (tokenize(text.join(' '), { maxTokens: P.maxWords }).truncated) return fingerprintText(text.join(' '), 'WORD_LIMIT');
                }
                return fingerprintText(text.join(' '), pdf.numPages > P.maxPages ? 'PAGE_LIMIT' : null);
            }
            finally {
                await task.destroy();
            }
        }
        finally {
            canvasGuard.deregister();
        }
    }
    catch (error) {
        if ((error as Error).message === 'MALFORMED')
            return skipped('MALFORMED');
        const name = (error as Error).name;
        return skipped(name === 'PasswordException' ? 'ENCRYPTED' : name === 'InvalidPDFException' ? 'MALFORMED' : 'ERROR');
    }
}
