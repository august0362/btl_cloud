import { readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';

/** Xoá tệp tạm còn sót (crash giữa request) cũ hơn maxAgeMs (§A6.9). Trả số tệp đã xoá. */
export async function sweepTmpDir(dir: string, maxAgeMs: number, now: Date = new Date()): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of entries) {
    const filePath = path.join(dir, name);
    try {
      const info = await stat(filePath);
      if (info.isFile() && now.getTime() - info.mtimeMs > maxAgeMs) {
        await unlink(filePath);
        removed += 1;
      }
    } catch {
      // Tệp có thể vừa bị request khác xoá — bỏ qua.
    }
  }
  return removed;
}

export async function removeFileQuietly(filePath: string | undefined): Promise<void> {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch {
    // Đã bị xoá (multer/errorHandler) — idempotent.
  }
}
