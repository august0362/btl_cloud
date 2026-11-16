import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ZipFile } from 'yazl';
import { afterEach, expect, it } from 'vitest';
import { extractFingerprint } from '../../src/modules/duplicates/text-extractor.js';
import { fingerprintText } from '../../src/modules/duplicates/minhash.js';
const dirs: string[] = [];
async function zip(parts: [string, string][]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'duplicates-')); dirs.push(dir); const file = path.join(dir, 'file.zip');
  const archive = new ZipFile(); for (const [name, text] of parts) archive.addBuffer(Buffer.from(text), name);
  const chunks: Buffer[] = []; const done = (async () => { for await (const chunk of archive.outputStream) chunks.push(Buffer.from(chunk)); })(); archive.end(); await done; await writeFile(file, Buffer.concat(chunks)); return file;
}
const words = Array.from({ length: 100 }, (_, i) => `từ${i}`).join(' ');
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true }))); });
it('extracts DOCX named/numeric entities and paragraph separators', async () => {
  const file = await zip([['word/document.xml', `<w:document><w:p><w:t>${words}</w:t></w:p><w:p><w:t>Điện &amp; To&#225;n &lt; đám &gt; &quot;mây&quot; &apos;a&apos;</w:t></w:p></w:document>`]]);
  expect(await extractFingerprint(file, 'DOCX', 500)).toEqual(fingerprintText(`${words} Điện & Toán < đám > "mây" 'a' `));
});
it('orders PPTX slides numerically and ignores notes', async () => {
  const file = await zip([['ppt/slides/slide10.xml', `<a:p><a:t>slide10 ${words}</a:t></a:p>`], ['ppt/slides/slide2.xml', '<a:p><a:t>slide2</a:t></a:p>'], ['ppt/notes/slide1.xml', '<a:t>ignore</a:t>']]);
  expect(await extractFingerprint(file, 'PPTX', 500)).toEqual(fingerprintText(`slide2 slide10 ${words}`));
});
it('marks malformed/empty office and oversize PDF explicitly', async () => {
  expect((await extractFingerprint(await zip([['word/document.xml', '<w:p><w:t>bad</w:p>']]), 'DOCX', 30)).reason).toBe('MALFORMED');
  expect((await extractFingerprint(await zip([['word/document.xml', '<w:p/>']]), 'DOCX', 10)).reason).toBe('INSUFFICIENT_TEXT');
  expect((await extractFingerprint('not-read', 'PDF', 10 * 1024 * 1024 + 1)).reason).toBe('TOO_LARGE');
});
it('limits decompressed XML and retains partial text from a zip bomb', async () => {
  const xml = `<w:p><w:t>${words}</w:t></w:p>` + ' '.repeat(11 * 1024 * 1024);
  const result = await extractFingerprint(await zip([['word/document.xml', xml]]), 'DOCX', 10000);
  expect(result).toMatchObject({ status: 'PARTIAL', reason: 'PART_LIMIT', textSha256: null }); expect(result.minhash?.length).toBe(512);
});
it('limits PPTX to first 300 parts', async () => {
  const parts: [string, string][] = Array.from({ length: 301 }, (_, i) => [`ppt/slides/slide${i + 1}.xml`, `<a:p><a:t>${words}</a:t></a:p>`]);
  expect(await extractFingerprint(await zip(parts), 'PPTX', 1000)).toMatchObject({ status: 'PARTIAL', reason: 'WORD_LIMIT' });
});

it('stops a 200 MiB decompression bomb inside the bounded worker before the deadline', async () => {
  const { Readable } = await import('node:stream');
  const { TextWorkerPool } = await import('../../src/modules/duplicates/text-worker-pool.js');
  const dir = await mkdtemp(path.join(tmpdir(), 'duplicates-bomb-')); dirs.push(dir); const file = path.join(dir, 'bomb.docx');
  const archive = new ZipFile();
  async function* bytes() { yield Buffer.from(`<w:p><w:t>${words}</w:t></w:p>`); for (let n = 0; n < 3200; n++) yield Buffer.alloc(65536, 32); }
  archive.addReadStream(Readable.from(bytes()), 'word/document.xml');
  const chunks: Buffer[] = []; const reading = (async () => { for await (const chunk of archive.outputStream) chunks.push(Buffer.from(chunk)); })(); archive.end(); await reading;
  const compressed = Buffer.concat(chunks); await writeFile(file, compressed);
  const start = performance.now(); const result = await new TextWorkerPool().analyze(file, 'DOCX', compressed.length);
  expect(result).toMatchObject({ status: 'PARTIAL', reason: 'PART_LIMIT' }); expect(performance.now() - start).toBeLessThan(15000);
});
