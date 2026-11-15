import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import yauzl from 'yauzl';
import type { InspectedFile } from '../files/file-inspector.js';

const MAX_XML_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_TEXT_CHARS = 400_000;
const MIN_WORDS = 40;
const SHINGLE_SIZE = 5;
const SIGNATURE_SIZE = 64;

export interface DocumentFingerprintInput {
  sha256: string;
  textHash: string | null;
  signature: string | null;
}

export type DuplicateKind = 'EXACT_FILE' | 'EXACT_TEXT' | 'NEAR_TEXT';
export interface DuplicateMatch {
  kind: DuplicateKind;
  similarity: number;
}

/** Hash stream: không tải tệp 50 MiB nguyên vẹn lên RAM. */
async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function decodeXml(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#x[0-9a-f]+|#[0-9]+);/gi, (entity) => {
    const lookup: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    const simple = lookup[entity.toLowerCase()];
    if (simple !== undefined) return simple;
    const hexadecimal = entity.toLowerCase().startsWith('&#x');
    const code = Number.parseInt(entity.slice(hexadecimal ? 3 : 2, -1), hexadecimal ? 16 : 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
  });
}

function xmlVisibleText(xml: string): string {
  const parts: string[] = [];
  for (const match of xml.matchAll(/<(?:w:t|a:t)(?:\s+[^>]*)?>([\s\S]*?)<\/(?:w:t|a:t)>/gi)) {
    parts.push(decodeXml(match[1] ?? ''));
  }
  return parts.join(' ');
}

/** Chỉ đọc text XML của Office, giới hạn giải nén để tránh ZIP bomb. */
function extractOfficeText(path: string, fileType: 'DOCX' | 'PPTX'): Promise<string | null> {
  return new Promise((resolve) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true }, (openError, zip) => {
      if (openError || !zip) { resolve(null); return; }
      let text = '';
      let totalBytes = 0;
      let done = false;
      const finish = (result: string | null) => {
        if (done) return;
        done = true;
        zip.close();
        resolve(result);
      };
      zip.on('error', () => finish(null));
      zip.on('end', () => finish(text));
      zip.on('entry', (entry: yauzl.Entry) => {
        const selected = fileType === 'DOCX'
          ? entry.fileName === 'word/document.xml'
          : /^ppt\/slides\/slide\d+\.xml$/.test(entry.fileName);
        if (!selected) { zip.readEntry(); return; }
        if (entry.uncompressedSize > MAX_XML_BYTES || totalBytes + entry.uncompressedSize > MAX_XML_BYTES) {
          finish(null);
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) { finish(null); return; }
          const chunks: Buffer[] = [];
          let read = 0;
          stream.on('data', (chunk: Buffer) => {
            read += chunk.length;
            if (read + totalBytes > MAX_XML_BYTES) {
              stream.destroy();
              finish(null);
              return;
            }
            chunks.push(chunk);
          });
          stream.on('error', () => finish(null));
          stream.on('end', () => {
            if (done) return;
            totalBytes += read;
            text += ' ' + xmlVisibleText(Buffer.concat(chunks).toString('utf8'));
            if (text.length > MAX_TOTAL_TEXT_CHARS) { finish(null); return; }
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

export function normalizeWords(text: string): string[] {
  return text.normalize('NFKC').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim().split(/\s+/u)
    .filter(Boolean)
    .slice(0, 60_000);
}

function hash32(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** MinHash 64 ô, dùng để xấp xỉ độ trùng các cụm 5 từ. Không phải điểm xác suất. */
export function textSignature(words: string[]): string | null {
  if (words.length < MIN_WORDS) return null;
  const values = new Uint32Array(SIGNATURE_SIZE).fill(0xffffffff);
  const seen = new Set<number>();
  for (let i = 0; i <= words.length - SHINGLE_SIZE; i++) {
    const h = hash32(words.slice(i, i + SHINGLE_SIZE).join(' '));
    if (seen.has(h)) continue;
    seen.add(h);
    for (let j = 0; j < SIGNATURE_SIZE; j++) {
      const mixed = Math.imul(h ^ Math.imul(j + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
      if (mixed < values[j]!) values[j] = mixed;
    }
  }
  return Array.from(values, (v) => v.toString(16).padStart(8, '0')).join('');
}

export function signatureSimilarity(left: string | null, right: string | null): number {
  if (!left || !right || left.length !== 512 || right.length !== 512) return 0;
  let matches = 0;
  for (let i = 0; i < 512; i += 8) {
    if (left.slice(i, i + 8) === right.slice(i, i + 8)) matches++;
  }
  return matches / SIGNATURE_SIZE;
}

/**
 * Hash tệp cho cả ba định dạng. MVP chỉ so sánh nội dung chữ trong DOCX/PPTX;
 * PDF và scan được bảo vệ ở tầng byte-hash, không giả vờ đã phân tích ngữ nghĩa.
 */
export async function fingerprintDocument(file: InspectedFile): Promise<DocumentFingerprintInput> {
  const sha256 = await hashFile(file.tmpPath);
  if (file.fileType === 'PDF') return { sha256, textHash: null, signature: null };
  const text = await extractOfficeText(file.tmpPath, file.fileType);
  if (!text) return { sha256, textHash: null, signature: null };
  const words = normalizeWords(text);
  if (words.length < MIN_WORDS) return { sha256, textHash: null, signature: null };
  return {
    sha256,
    textHash: createHash('sha256').update(words.join(' ')).digest('hex'),
    signature: textSignature(words),
  };
}
