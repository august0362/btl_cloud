import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/http/errors.js';
import { escapeLike } from '../../src/modules/documents/document.repository.js';
import { asciiFallbackFilename, attachmentDisposition } from '../../src/modules/files/content-disposition.js';
import { inspectFile, sanitizeFilename } from '../../src/modules/files/file-inspector.js';
import { newObjectKey } from '../../src/modules/files/storage-keys.js';
import { docxBuffer, pdfBuffer, plainZipBuffer, pptxBuffer, textBuffer, writeTempFile } from '../helpers/fixtures.js';

async function inspect(name: string, data: Buffer) {
  const filePath = await writeTempFile('upload.bin', data);
  return inspectFile(filePath, name, data.length);
}

async function expectRejected(promise: Promise<unknown>, code: string, issue?: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
  if (issue) expect((error as AppError).details[0]?.issue).toBe(issue);
}

describe('FileInspector (§A6.4, NFR-SEC-07)', () => {
  it('nhận đúng loại và MIME theo nội dung cho PDF, DOCX, PPTX', async () => {
    await expect(inspect('a.pdf', pdfBuffer())).resolves.toMatchObject({ fileType: 'PDF', mimeType: 'application/pdf', extension: 'pdf' });
    await expect(inspect('b.DOCX', await docxBuffer())).resolves.toMatchObject({
      fileType: 'DOCX',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    await expect(inspect('c.pptx', await pptxBuffer())).resolves.toMatchObject({
      fileType: 'PPTX',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
  });

  it('từ chối tệp văn bản đổi đuôi .pdf, ZIP thường đổi đuôi .docx, DOCX đổi đuôi .pptx', async () => {
    await expectRejected(inspect('gia.pdf', textBuffer()), 'UNSUPPORTED_FILE_TYPE');
    await expectRejected(inspect('gia.docx', await plainZipBuffer()), 'UNSUPPORTED_FILE_TYPE');
    await expectRejected(inspect('gia.pptx', await docxBuffer()), 'UNSUPPORTED_FILE_TYPE');
    await expectRejected(inspect('virus.exe', pdfBuffer()), 'UNSUPPORTED_FILE_TYPE');
    await expectRejected(inspect('khong-duoi', pdfBuffer()), 'UNSUPPORTED_FILE_TYPE');
  });

  it('tệp rỗng → VALIDATION_ERROR / EMPTY_FILE', async () => {
    await expectRejected(inspect('rong.pdf', Buffer.alloc(0)), 'VALIDATION_ERROR', 'EMPTY_FILE');
  });

  it('ZIP hỏng có chữ ký PK → 415 thay vì lỗi 500', async () => {
    await expectRejected(inspect('hong.docx', Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])), 'UNSUPPORTED_FILE_TYPE');
  });
});

describe('sanitizeFilename (§A6.4 quy tắc 6)', () => {
  it('giữ tiếng Việt, chuẩn hoá NFC, bỏ đường dẫn và ký tự điều khiển', () => {
    expect(sanitizeFilename('C:\\Users\\a\\Đề cương Giải tích 1.PDF')).toEqual({ filename: 'Đề cương Giải tích 1.PDF', extension: 'pdf' });
    expect(sanitizeFilename('../../etc/"bad"\u0007name.pdf').filename).toBe('badname.pdf');
    expect(sanitizeFilename('De\u0300 cu\u031bo\u031bng.pdf').filename).toBe('Dè cương.pdf'.normalize('NFC'));
  });
  it('tên rỗng → tai-lieu.<ext>; quá 255 ký tự → cắt phần tên, giữ đuôi', () => {
    expect(sanitizeFilename('.pdf').filename).toBe('tai-lieu.pdf');
    const long = sanitizeFilename(`${'á'.repeat(300)}.docx`).filename;
    expect([...long].length).toBe(255);
    expect(long.endsWith('.docx')).toBe(true);
  });
});

describe('Content-Disposition (API-13)', () => {
  it('khớp ví dụ ở ARCHITECTURE §A7.7', () => {
    expect(attachmentDisposition('Đề cương Giải tích 1.pdf')).toBe(
      `attachment; filename="De cuong Giai tich 1.pdf"; filename*=UTF-8''%C4%90%E1%BB%81%20c%C6%B0%C6%A1ng%20Gi%E1%BA%A3i%20t%C3%ADch%201.pdf`,
    );
  });
  it('fallback ASCII bỏ ký tự ngoài ASCII, dấu nháy kép và backslash', () => {
    expect(asciiFallbackFilename('báo "cáo"\\漢.pdf')).toBe('bao cao_.pdf');
    expect(attachmentDisposition("it's (1).pdf")).toContain("filename*=UTF-8''it%27s%20%281%29.pdf");
  });
});

describe('storage key, LIKE escape', () => {
  it('key bất biến dạng documents/{id}/{uuid}.{ext}, mỗi lần một key mới (D-06)', () => {
    const a = newObjectKey('3f2b6c1e-8a4d-4f7e-9c2a-1b5d7e9f0a12', 'pdf');
    const b = newObjectKey('3f2b6c1e-8a4d-4f7e-9c2a-1b5d7e9f0a12', 'pdf');
    expect(a).toMatch(/^documents\/3f2b6c1e-8a4d-4f7e-9c2a-1b5d7e9f0a12\/[0-9a-f-]{36}\.pdf$/);
    expect(a).not.toBe(b);
  });
  it('escape %, _ và ký tự escape "!"', () => {
    expect(escapeLike('50%_off!')).toBe('50!%!_off!!');
  });
});
