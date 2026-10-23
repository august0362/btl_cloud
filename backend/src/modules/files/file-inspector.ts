import { open } from 'node:fs/promises';
import path from 'node:path';
import yauzl from 'yauzl';
import { AppError, validationError } from '../../http/errors.js';
import { codePointLength, issueMessage } from '../../http/validate.js';
import { FILE_TYPES, type FileType } from './file-types.js';

export interface InspectedFile {
  fileType: FileType;
  mimeType: string;
  extension: string;
  sanitizedFilename: string;
  sizeBytes: number;
  tmpPath: string;
}

const MAX_FILENAME_CODE_POINTS = 255;
const MAX_ZIP_ENTRIES = 10_000;
const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OOXML_MAIN_PART: Record<string, string> = { docx: 'word/document.xml', pptx: 'ppt/presentation.xml' };

function truncateCodePoints(value: string, max: number): string {
  return [...value].slice(0, Math.max(0, max)).join('');
}

/** Làm sạch tên tệp (§A6.4 quy tắc 6). Trả về tên an toàn để lưu metadata và gửi khi tải xuống. */
export function sanitizeFilename(original: string): { filename: string; extension: string } {
  let name = path.posix.basename(original.replace(/\\/g, '/'));
  // Cố ý loại bỏ ký tự điều khiển khỏi tên tệp (§A6.4).
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001F\u007F"]/g, '').normalize('NFC').trim();
  const dot = name.lastIndexOf('.');
  let stem = dot > 0 ? name.slice(0, dot) : dot === 0 ? '' : name;
  const rawExtension = dot >= 0 ? name.slice(dot + 1) : '';
  // Tên lưu giữ nguyên cách viết của người dùng; chỉ phần kiểm loại tệp dùng chữ thường.
  const extension = rawExtension.toLowerCase();
  if (stem.trim().length === 0) stem = 'tai-lieu';
  const suffix = rawExtension ? `.${rawExtension}` : '';
  if (codePointLength(stem) + codePointLength(suffix) > MAX_FILENAME_CODE_POINTS) {
    stem = truncateCodePoints(stem, MAX_FILENAME_CODE_POINTS - codePointLength(suffix)).trimEnd() || 'tai-lieu';
  }
  return { filename: `${stem}${suffix}`, extension };
}

async function readHeader(filePath: string, length: number): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Đọc danh sách entry trong central directory, không giải nén (chống zip bomb). */
function listZipEntries(filePath: string): Promise<Set<string>> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: true, strictFileNames: false }, (openError, zipfile) => {
      if (openError || !zipfile) return reject(openError ?? new Error('Không mở được ZIP'));
      const names = new Set<string>();
      zipfile.on('entry', (entry: yauzl.Entry) => {
        names.add(entry.fileName);
        if (names.size >= MAX_ZIP_ENTRIES) {
          zipfile.close();
          resolve(names);
          return;
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(names));
      zipfile.on('error', reject);
      zipfile.readEntry();
    });
  });
}

function unsupported(): AppError {
  return new AppError('UNSUPPORTED_FILE_TYPE');
}

/** Xác định loại tệp theo phần mở rộng + chữ ký nội dung; bỏ qua MIME do client gửi (§A6.4, NFR-SEC-07). */
export async function inspectFile(tmpPath: string, originalName: string, sizeBytes: number): Promise<InspectedFile> {
  if (sizeBytes === 0) {
    throw validationError([{ field: 'file', issue: 'EMPTY_FILE', message: issueMessage('file', 'EMPTY_FILE') }]);
  }
  const { filename, extension } = sanitizeFilename(originalName);
  const type = FILE_TYPES[extension];
  if (!type) throw unsupported();

  const header = await readHeader(tmpPath, 8);
  if (extension === 'pdf') {
    if (!header.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) throw unsupported();
  } else {
    if (!header.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) throw unsupported();
    let entries: Set<string>;
    try {
      entries = await listZipEntries(tmpPath);
    } catch {
      throw unsupported();
    }
    const mainPart = OOXML_MAIN_PART[extension];
    if (!entries.has('[Content_Types].xml') || !mainPart || !entries.has(mainPart)) throw unsupported();
  }

  return { fileType: type.fileType, mimeType: type.mimeType, extension, sanitizedFilename: filename, sizeBytes, tmpPath };
}
