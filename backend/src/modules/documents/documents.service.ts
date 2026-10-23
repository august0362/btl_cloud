import type { CleanupService } from '../../cleanup/cleanup.service.js';
import { isRecordNotFound, type TransactionRunner } from '../../db/prisma.js';
import { AppError } from '../../http/errors.js';
import type { Clock } from '../../lib/clock.js';
import { newId } from '../../lib/ids.js';
import type { Logger } from '../../lib/logger.js';
import { StorageError, type ObjectStorage, type StoredObject } from '../../storage/object-storage.js';
import type { InspectedFile } from '../files/file-inspector.js';
import { newObjectKey } from '../files/storage-keys.js';
import { toDocumentDto, toPageDto, type DocumentDto, type PageDto } from './document.mapper.js';
import { canView, type Viewer } from './document.policy.js';
import type { DocumentRepository, DocumentWithOwner } from './document.repository.js';
import type { CreateFields, MineQuery, PatchInput, PublicQuery } from './documents.schemas.js';

/** Guard đã bị worker claim trong lúc upload quá chậm (INV-C3). */
class GuardLostError extends Error {}
/** UPDATE/DELETE có điều kiện `file_version` không khớp (D-08). */
class VersionConflictError extends Error {}

function storageUnavailable(error: unknown): AppError {
  return new AppError('STORAGE_UNAVAILABLE', { cause: error });
}

export class DocumentService {
  constructor(
    private readonly runInTransaction: TransactionRunner,
    private readonly documents: DocumentRepository,
    private readonly cleanup: CleanupService,
    private readonly storage: ObjectStorage,
    private readonly clock: Clock,
    private readonly logger: Logger,
    private readonly graceSeconds: number,
  ) {}

  async searchPublic(query: PublicQuery, viewer: Viewer | null): Promise<PageDto<DocumentDto>> {
    const { rows, total } = await this.documents.search({ scope: { kind: 'public' }, ...query });
    return toPageDto(rows.map((row) => toDocumentDto(row, viewer?.userId)), query.page, query.pageSize, total);
  }

  async listMine(userId: string, query: MineQuery): Promise<PageDto<DocumentDto>> {
    const { rows, total } = await this.documents.search({ scope: { kind: 'owner', ownerId: userId }, ...query });
    return toPageDto(rows.map((row) => toDocumentDto(row, userId)), query.page, query.pageSize, total);
  }

  async getForViewer(id: string, viewer: Viewer | null): Promise<DocumentDto> {
    const row = await this.documents.findById(id);
    if (!row || canView(row, viewer) !== 'ALLOW') throw new AppError('DOCUMENT_NOT_FOUND');
    return toDocumentDto(row, viewer?.userId);
  }

  private async reload(id: string, viewerUserId: string): Promise<DocumentDto> {
    const row = await this.documents.findById(id);
    if (!row) throw new AppError('DOCUMENT_NOT_FOUND');
    return toDocumentDto(row, viewerUserId);
  }

  /**
   * API-10, §A6.3: guard → PutObject → transaction (xoá guard + INSERT).
   * Mọi lỗi đều không để lại bản ghi documents (BR-06); object được bù trừ ngay hoặc worker dọn sau.
   */
  async create(ownerId: string, fields: CreateFields, file: InspectedFile): Promise<DocumentDto> {
    const documentId = newId();
    const storageKey = newObjectKey(documentId, file.extension);
    await this.cleanup.createGuard(storageKey, documentId);

    try {
      await this.storage.putObject({ key: storageKey, filePath: file.tmpPath, contentType: file.mimeType, contentLength: file.sizeBytes });
    } catch (error) {
      await this.cleanup.releaseGuard(storageKey);
      throw storageUnavailable(error);
    }

    const now = this.clock.now();
    try {
      await this.runInTransaction(async (tx) => {
        if (!(await this.cleanup.consumeGuard(tx, storageKey))) throw new GuardLostError();
        await this.documents.insert(tx, {
          id: documentId,
          ownerId,
          title: fields.title,
          description: fields.description ?? null,
          visibility: fields.visibility,
          fileType: file.fileType,
          mimeType: file.mimeType,
          originalFilename: file.sanitizedFilename,
          sizeBytes: file.sizeBytes,
          storageKey,
          createdAt: now,
          updatedAt: now,
          fileUpdatedAt: now,
        });
      });
    } catch (error) {
      await this.cleanup.releaseGuard(storageKey);
      if (error instanceof GuardLostError) {
        this.logger.error({ event: 'upload.guard_lost', storageKey }, 'Guard đã bị claim trước khi commit');
        throw new AppError('INTERNAL_ERROR', { cause: error });
      }
      throw error;
    }
    return this.reload(documentId, ownerId);
  }

  /** API-11: chỉ đổi metadata; tệp và file_version giữ nguyên. Tài liệu đã được loader kiểm quyền. */
  async updateMetadata(doc: DocumentWithOwner, patch: PatchInput, viewerUserId: string): Promise<DocumentDto> {
    const data: { title?: string; description?: string | null; visibility?: 'PUBLIC' | 'PRIVATE' } = {};
    if (patch.title !== undefined) data.title = patch.title;
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.visibility !== undefined) data.visibility = patch.visibility;
    try {
      const updated = await this.documents.updateMetadata(doc.id, data, this.clock.now());
      return toDocumentDto(updated, viewerUserId);
    } catch (error) {
      if (isRecordNotFound(error)) throw new AppError('DOCUMENT_NOT_FOUND');
      throw error;
    }
  }

  /**
   * API-12, §A6.6: tệp cũ còn nguyên tới khi COMMIT; key mới khác key cũ; không ghi visibility;
   * xoá key cũ là task có ân hạn và thử lại.
   */
  async replaceFile(doc: DocumentWithOwner, file: InspectedFile, viewerUserId: string): Promise<DocumentDto> {
    const oldKey = doc.storageKey;
    const expectedVersion = Number(doc.fileVersion);
    const newKey = newObjectKey(doc.id, file.extension);
    await this.cleanup.createGuard(newKey, doc.id);

    try {
      await this.storage.putObject({ key: newKey, filePath: file.tmpPath, contentType: file.mimeType, contentLength: file.sizeBytes });
    } catch (error) {
      await this.cleanup.releaseGuard(newKey);
      throw storageUnavailable(error);
    }

    const now = this.clock.now();
    try {
      await this.runInTransaction(async (tx) => {
        if (!(await this.cleanup.consumeGuard(tx, newKey))) throw new GuardLostError();
        const changed = await this.documents.updateFileIfVersion(
          tx,
          doc.id,
          expectedVersion,
          { storageKey: newKey, fileType: file.fileType, mimeType: file.mimeType, originalFilename: file.sanitizedFilename, sizeBytes: file.sizeBytes },
          now,
        );
        if (changed !== 1) throw new VersionConflictError();
        await this.cleanup.scheduleDeletion(tx, {
          storageKey: oldKey,
          reason: 'REPLACED',
          documentId: doc.id,
          notBefore: new Date(now.getTime() + this.graceSeconds * 1000),
        });
      });
    } catch (error) {
      await this.cleanup.releaseGuard(newKey);
      if (error instanceof VersionConflictError) {
        throw new AppError((await this.documents.findById(doc.id)) ? 'CONFLICT' : 'DOCUMENT_NOT_FOUND');
      }
      if (error instanceof GuardLostError) {
        this.logger.error({ event: 'replace.guard_lost', storageKey: newKey }, 'Guard đã bị claim trước khi commit');
        throw new AppError('INTERNAL_ERROR', { cause: error });
      }
      throw error;
    }
    return this.reload(doc.id, viewerUserId);
  }

  /**
   * API-14, §A6.7: transaction (DELETE có điều kiện + task DELETED) → thử xoá object ngay.
   * Storage lỗi sau COMMIT không làm request thất bại; worker thử lại (BR-08).
   */
  async delete(doc: DocumentWithOwner): Promise<void> {
    let taskId: bigint | null = null;
    for (let attempt = 1; attempt <= 2 && taskId === null; attempt += 1) {
      const current = attempt === 1 ? doc : await this.documents.findById(doc.id);
      if (!current) throw new AppError('DOCUMENT_NOT_FOUND');
      try {
        taskId = await this.runInTransaction(async (tx) => {
          if ((await this.documents.deleteIfVersion(tx, current.id, Number(current.fileVersion))) !== 1) throw new VersionConflictError();
          return this.cleanup.scheduleDeletion(tx, {
            storageKey: current.storageKey,
            reason: 'DELETED',
            documentId: current.id,
            notBefore: this.clock.now(),
          });
        });
      } catch (error) {
        if (!(error instanceof VersionConflictError)) throw error;
        if (attempt === 2) throw new AppError((await this.documents.findById(doc.id)) ? 'CONFLICT' : 'DOCUMENT_NOT_FOUND');
      }
    }
    if (taskId === null) return;
    try {
      await this.cleanup.processTask(taskId);
    } catch (error) {
      this.logger.warn({ err: error, documentId: doc.id, event: 'delete.cleanup_deferred' }, 'Chưa xoá được object; worker sẽ thử lại');
    }
  }

  /** API-13: mở stream từ storage; object mất là vi phạm INV-D1 → log ERROR và trả 503. */
  async openDownload(doc: DocumentWithOwner): Promise<StoredObject> {
    try {
      return await this.storage.getObject(doc.storageKey);
    } catch (error) {
      if (error instanceof StorageError && error.kind === 'NOT_FOUND') {
        this.logger.error({ event: 'download.object_missing', documentId: doc.id, storageKey: doc.storageKey }, 'Object của tài liệu không tồn tại');
      }
      throw storageUnavailable(error);
    }
  }
}
