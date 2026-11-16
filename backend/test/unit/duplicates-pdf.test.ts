import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { TextWorkerPool } from '../../src/modules/duplicates/text-worker-pool.js';
import { fingerprintText } from '../../src/modules/duplicates/minhash.js';
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true }))); });
/** Minimal text PDF with an explicit Unicode map; no rendering or font download. */
function pdf(text: string, pages = 1): Buffer {
  const chars = [...new Set(text)]; const codes = new Map(chars.map((c, i) => [c, i + 33]));
  const mapping = chars.map((c, i) => `<${(i + 33).toString(16).padStart(2, '0')}> <${c.charCodeAt(0).toString(16).padStart(4, '0')}>`).join('\n');
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Test def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange ${chars.length} beginbfchar ${mapping} endbfchar endcmap CMapName currentdict /CMap defineresource pop end end`;
  const lines: string[] = [];
  const words = text.split(' ');
  for (let i = 0; i < words.length; i += 4) lines.push(words.slice(i, i + 4).join(' '));
  const content = `BT /F1 10 Tf 10 760 Td ${lines.map((line, i) => `${i ? '0 -12 Td ' : ''}<${[...line].map((c) => codes.get(c)!.toString(16).padStart(2, '0')).join('')}> Tj`).join(' ')} ET`;

  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${Array.from({ length: pages }, () => '3 0 R').join(' ')}] /Count ${pages} >>`, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`, `<< /Length ${cmap.length} >>\nstream\n${cmap}\nendstream`];
  let source = '%PDF-1.7\n'; const offsets = [0]; for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(source)); source += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(source); source += `xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(source);
}
it('extracts accented Vietnamese PDF text in a bounded worker', async () => {
  const text = Array.from({ length: 60 }, () => 'điện toán đám mây').join(' ');
  const dir = await mkdtemp(path.join(tmpdir(), 'dup-pdf-')); dirs.push(dir); const file = path.join(dir, 'text.pdf'); const bytes = pdf(text); await writeFile(file, bytes);
  const result = await new TextWorkerPool().analyze(file, 'PDF', bytes.length);
  expect(result).toEqual({ ...fingerprintText(text), minhash: expect.any(Uint8Array) });
  expect(Buffer.from(result.minhash!)).toEqual(fingerprintText(text).minhash);
});
it('marks a PDF without a text layer as insufficient, not zero similarity', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'dup-empty-pdf-')); dirs.push(dir); const file = path.join(dir, 'scan.pdf'); const bytes = pdf(''); await writeFile(file, bytes);
  expect(await new TextWorkerPool().analyze(file, 'PDF', bytes.length)).toMatchObject({ status: 'SKIPPED', reason: 'INSUFFICIENT_TEXT', minhash: null });
});

it('marks password-encrypted PDFs explicitly', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'dup-encrypted-')); dirs.push(dir); const file = path.join(dir, 'encrypted.pdf');
  const bytes = Buffer.from('JVBERi0xLjMKJeLjz9MKMSAwIG9iago8PAovUHJvZHVjZXIgPDVjOWZkYTBmOTA+Cj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9UeXBlIC9QYWdlcwovQ291bnQgMQovS2lkcyBbIDQgMCBSIF0KPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iago0IDAgb2JqCjw8Ci9UeXBlIC9QYWdlCi9SZXNvdXJjZXMgPDwKPj4KL01lZGlhQm94IFsgMC4wIDAuMCA2MTIgNzkyIF0KL1BhcmVudCAyIDAgUgo+PgplbmRvYmoKNSAwIG9iago8PAovViAyCi9SIDMKL0xlbmd0aCAxMjgKL1AgNDI5NDk2NzI5MgovRmlsdGVyIC9TdGFuZGFyZAovTyA8NDA4YjM3YmNmMTJkYTg3M2Q3ZjI4NDBmM2MxYjkxN2EwMjM5NjFkZWQ0YzgxNjRkMzhlNDZlOTY1NWU2Njc3NT4KL1UgPDc4MTdjZjcyZGE0MTZiMzlhZjYwM2RkZmUyMzM1NzcwMjhiZjRlNWU0ZTc1OGE0MTY0MDA0ZTU2ZmZmYTAxMDg+Cj4+CmVuZG9iagp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMTUgMDAwMDAgbiAKMDAwMDAwMDA1OSAwMDAwMCBuIAowMDAwMDAwMTE4IDAwMDAwIG4gCjAwMDAwMDAxNjcgMDAwMDAgbiAKMDAwMDAwMDI2MSAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9TaXplIDYKL1Jvb3QgMyAwIFIKL0luZm8gMSAwIFIKL0lEIFsgPDM1NjEzMTMyNjIzNzY0MzczODM1NjEzNjY0MzUzNTM3MzUzNjM5NjI2MjM3MzA2NDMyMzQzMjMyNjEzNzMwMzk+IDwzNTYxMzEzMjYyMzc2NDM3MzgzNTYxMzY2NDM1MzUzNzM1MzYzOTYyNjIzNzMwNjQzMjM0MzIzMjYxMzczMDM5PiBdCi9FbmNyeXB0IDUgMCBSCj4+CnN0YXJ0eHJlZgo0NzYKJSVFT0YK', 'base64'); await writeFile(file, bytes);
  expect(await new TextWorkerPool().analyze(file, 'PDF', bytes.length)).toMatchObject({ status: 'SKIPPED', reason: 'ENCRYPTED' });
});
it('bounds PDF extraction to one hundred pages and marks partial analysis', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'dup-pages-')); dirs.push(dir); const file = path.join(dir, 'pages.pdf');
  const bytes = pdf(Array.from({ length: 60 }, () => 'word').join(' '), 101); await writeFile(file, bytes);
  expect(await new TextWorkerPool().analyze(file, 'PDF', bytes.length)).toMatchObject({ status: 'PARTIAL', reason: 'PAGE_LIMIT', textSha256: null });
});
