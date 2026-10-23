import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import multer from 'multer';
import { AppError, validationError } from '../../http/errors.js';
import { issueMessage } from '../../http/validate.js';
import { MAX_UPLOAD_BYTES } from './file-types.js';

const TEXT_PART_MAX_BYTES = 16 * 1024;
const MAX_TEXT_PARTS = 5;

function mapMulterError(error: unknown): AppError {
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return new AppError('FILE_TOO_LARGE');
      case 'LIMIT_FILE_COUNT':
        return validationError([{ field: 'file', issue: 'TOO_MANY_FILES', message: issueMessage('file', 'TOO_MANY_FILES') }]);
      case 'LIMIT_UNEXPECTED_FILE': {
        const field = error.field ?? 'file';
        return field === 'file'
          ? validationError([{ field: 'file', issue: 'TOO_MANY_FILES', message: issueMessage('file', 'TOO_MANY_FILES') }])
          : validationError([{ field, issue: 'UNKNOWN_FIELD', message: issueMessage(field, 'UNKNOWN_FIELD') }]);
      }
      default:
        // LIMIT_FIELD_VALUE, LIMIT_FIELD_COUNT, LIMIT_FIELD_KEY, LIMIT_PART_COUNT
        return new AppError('PAYLOAD_TOO_LARGE');
    }
  }
  return validationError([{ field: 'body', issue: 'INVALID_FORMAT', message: 'Dữ liệu multipart không hợp lệ.' }]);
}

/**
 * multer ghi đúng 1 tệp (part `file`) vào thư mục tạm, không đệm trong RAM (U2, NFR-SCL-03).
 * Vượt giới hạn → multer xoá tệp dở và xả phần body còn lại; lỗi được map sang envelope §A7.3.
 */
export function createUploadMiddleware(tmpDir: string): RequestHandler {
  const upload = multer({
    storage: multer.diskStorage({
      destination: tmpDir,
      filename: (_req, _file, callback) => callback(null, randomUUID()),
    }),
    limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: MAX_TEXT_PARTS, fieldSize: TEXT_PART_MAX_BYTES, fieldNameSize: 100 },
    // busboy mặc định giải mã tên tệp theo latin1 → tên tiếng Việt bị hỏng (RK-09).
    defParamCharset: 'utf8',
  } as multer.Options & { defParamCharset: string }).single('file');

  return (req, res, next) => {
    upload(req, res, (error?: unknown) => {
      if (error) return next(mapMulterError(error));
      next();
    });
  };
}
