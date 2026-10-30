import { isRecordNotFound } from '../../db/prisma.js';
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

function storageUnavailable(error: unknown, stage: 'storage.put' | 'storage.get'): AppError {
  return new AppError('STORAGE_UNAVAILABLE', { cause: error, stage });
}

function databaseError(error: unknown): AppError {
  return error instanceof AppError ? error : new AppError('INTERNAL_ERROR', { cause: error, stage: 'db' });
}

export class DocumentService {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly storage: ObjectStorage,
    private readonly clock: Clock,
    private readonly logger: Logger,
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

  private async deleteObjectBestEffort(storageKey: string): Promise<void> {
    try {
      await this.storage.deleteObject(storageKey);
    } catch (error) {
      this.logger.warn({ err: error, event: 'storage.orphan', stage: 'storage.delete', storageKey }, 'Không xoá được object');
    }
  }

  /** API-10: PutObject → INSERT; bù trừ object nếu DB thất bại. */
  async create(ownerId: string, fields: CreateFields, file: InspectedFile): Promise<DocumentDto> {
    const documentId = newId();
    const storageKey = newObjectKey(documentId, file.extension);
    try {
      await this.storage.putObject({ key: storageKey, filePath: file.tmpPath, contentType: file.mimeType, contentLength: file.sizeBytes });
    } catch (error) {
      throw storageUnavailable(error, 'storage.put');
    }
    const now = this.clock.now();
    try {
      await this.documents.insert({
        id: documentId, ownerId, title: fields.title, description: fields.description ?? null,
        visibility: fields.visibility, fileType: file.fileType, mimeType: file.mimeType,
        originalFilename: file.sanitizedFilename, sizeBytes: file.sizeBytes, storageKey,
        createdAt: now, updatedAt: now, fileUpdatedAt: now,
      });
    } catch (error) {
      await this.deleteObjectBestEffort(storageKey);
      throw databaseError(error);
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
      if (isRecordNotFound(error)) throw new AppError('DOCUMENT_NOT_FOUND', { stage: 'db' });
      throw databaseError(error);
    }
  }

  /** API-12: key mới bất biến; cập nhật theo id, phiên bản chỉ là bộ đếm hiển thị. */
  async replaceFile(doc: DocumentWithOwner, file: InspectedFile, viewerUserId: string): Promise<DocumentDto> {
    const newKey = newObjectKey(doc.id, file.extension);
    try {
      await this.storage.putObject({ key: newKey, filePath: file.tmpPath, contentType: file.mimeType, contentLength: file.sizeBytes });
    } catch (error) {
      throw storageUnavailable(error, 'storage.put');
    }
    try {
      const changed = await this.documents.updateFile(doc.id, {
        storageKey: newKey, fileType: file.fileType, mimeType: file.mimeType,
        originalFilename: file.sanitizedFilename, sizeBytes: file.sizeBytes,
      }, this.clock.now());
      if (changed === 0) throw new AppError('DOCUMENT_NOT_FOUND', { stage: 'db' });
    } catch (error) {
      await this.deleteObjectBestEffort(newKey);
      throw databaseError(error);
    }
    await this.deleteObjectBestEffort(doc.storageKey);
    return this.reload(doc.id, viewerUserId);
  }

  /** API-14: xoá DB trước; lỗi storage không đổi kết quả 204. */
  async delete(doc: DocumentWithOwner): Promise<void> {
    let deleted: DocumentWithOwner;
    try {
      deleted = await this.documents.delete(doc.id);
    } catch (error) {
      if (isRecordNotFound(error)) throw new AppError('DOCUMENT_NOT_FOUND', { stage: 'db' });
      throw databaseError(error);
    }
    await this.deleteObjectBestEffort(deleted.storageKey);
  }

  /** API-13: mở stream từ storage; object mất là vi phạm INV-D1 → log ERROR và trả 503. */
  async openDownload(doc: DocumentWithOwner): Promise<StoredObject> {
    try {
      return await this.storage.getObject(doc.storageKey);
    } catch (error) {
      if (error instanceof StorageError && error.kind === 'NOT_FOUND') {
        this.logger.error({ event: 'download.object_missing', stage: 'storage.get', documentId: doc.id, storageKey: doc.storageKey }, 'Object của tài liệu không tồn tại');
      }
      throw storageUnavailable(error, 'storage.get');
    }
  }
}
