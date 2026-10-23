import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import yazl from 'yazl';

/** Tệp mẫu sinh lúc chạy (§M1-10): PDF/DOCX/PPTX hợp lệ, tệp giả mạo, tệp rỗng. */
export function pdfBuffer(label = 'mau'): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${label}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`, 'utf8');
}

function zipBuffer(entries: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile();
    for (const [name, content] of Object.entries(entries)) zip.addBuffer(Buffer.from(content, 'utf8'), name);
    const chunks: Buffer[] = [];
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
    zip.end();
  });
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';

export function docxBuffer(text = 'Xin chao'): Promise<Buffer> {
  return zipBuffer({ '[Content_Types].xml': CONTENT_TYPES, 'word/document.xml': `<w:document><w:body>${text}</w:body></w:document>` });
}

export function pptxBuffer(text = 'Slide'): Promise<Buffer> {
  return zipBuffer({ '[Content_Types].xml': CONTENT_TYPES, 'ppt/presentation.xml': `<p:presentation>${text}</p:presentation>` });
}

/** ZIP hợp lệ nhưng không phải OOXML — đổi đuôi thành .docx phải bị từ chối. */
export function plainZipBuffer(): Promise<Buffer> {
  return zipBuffer({ 'readme.txt': 'not an office file' });
}

export function textBuffer(): Buffer {
  return Buffer.from('Đây là tệp văn bản thường, không phải PDF.\n', 'utf8');
}

/** Tệp có chữ ký PDF với kích thước chính xác (dùng cho kiểm tra biên 50 MB). */
export function pdfOfSize(size: number): Buffer {
  const buffer = Buffer.alloc(size, 0x20);
  buffer.write('%PDF-1.4\n', 0, 'ascii');
  return buffer;
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function writeTempFile(name: string, data: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'btl-fixture-'));
  const filePath = path.join(dir, name);
  await writeFile(filePath, data);
  return filePath;
}
