import { describe, expect, it, vi } from 'vitest';
import { createLogger } from '../../src/lib/logger.js';
import type { DocumentRepository, DocumentWithOwner } from '../../src/modules/documents/document.repository.js';
import { DocumentService } from '../../src/modules/documents/documents.service.js';
import { StorageError } from '../../src/storage/object-storage.js';

const now = new Date('2026-10-30T00:00:00Z');
const doc: DocumentWithOwner = {
  id: 'document', ownerId: 'owner', title: 'title', description: null, visibility: 'PUBLIC',
  fileType: 'PDF', mimeType: 'application/pdf', originalFilename: 'file.pdf', sizeBytes: 1,
  storageKey: 'old-key', fileVersion: 1, createdAt: now, updatedAt: now, fileUpdatedAt: now,
  owner: { id: 'owner', displayName: 'Owner' },
};
const file = { fileType: 'PDF' as const, mimeType: 'application/pdf', extension: 'pdf', sanitizedFilename: 'file.pdf', sizeBytes: 1, tmpPath: 'unused' };
const fields = { title: 'title', visibility: 'PUBLIC' as const };

function setup() {
  const documents = {
    insert: vi.fn().mockResolvedValue(undefined), findById: vi.fn().mockResolvedValue(doc),
    updateMetadata: vi.fn().mockResolvedValue(doc), updateFile: vi.fn().mockResolvedValue(1), delete: vi.fn().mockResolvedValue(doc),
  };
  const storage = { putObject: vi.fn().mockResolvedValue(undefined), getObject: vi.fn(), deleteObject: vi.fn().mockResolvedValue(undefined), checkHealth: vi.fn() };
  const lines: string[] = [];
  const logger = createLogger({ level: 'info', instanceId: 'test' }, { write: (line) => { lines.push(line); } });
  const service = new DocumentService(documents as unknown as DocumentRepository, storage, { now: () => now }, logger);
  return { service, documents, storage, lines };
}

describe('documents: stage tại chỗ bọc lỗi, không đổi kết quả (§A12.3 XM-14)', () => {
  it.each(['create', 'replace'] as const)('%s: put lỗi → 503 storage.put, không ghi DB', async (operation) => {
    const { service, documents, storage } = setup();
    storage.putObject.mockRejectedValue(new StorageError('UNAVAILABLE', 'offline'));
    await expect(operation === 'create' ? service.create('owner', fields, file) : service.replaceFile(doc, file, 'owner'))
      .rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE', status: 503, stage: 'storage.put' });
    expect(documents.insert).not.toHaveBeenCalled();
    expect(documents.updateFile).not.toHaveBeenCalled();
  });

  it.each(['UNAVAILABLE', 'NOT_FOUND'] as const)('get %s → 503 storage.get', async (kind) => {
    const { service, storage } = setup();
    storage.getObject.mockRejectedValue(new StorageError(kind, 'offline'));
    await expect(service.openDownload(doc)).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE', stage: 'storage.get' });
  });

  it.each(['create', 'replace', 'update', 'delete'] as const)('%s: DB lỗi → 500 db, vẫn bù trừ khi cần', async (operation) => {
    const { service, documents, storage } = setup();
    const failure = new Error('database unavailable');
    const calls = {
      create: () => { documents.insert.mockRejectedValue(failure); return service.create('owner', fields, file); },
      replace: () => { documents.updateFile.mockRejectedValue(failure); return service.replaceFile(doc, file, 'owner'); },
      update: () => { documents.updateMetadata.mockRejectedValue(failure); return service.updateMetadata(doc, { title: 'changed' }, 'owner'); },
      delete: () => { documents.delete.mockRejectedValue(failure); return service.delete(doc); },
    };
    await expect(calls[operation]()).rejects.toMatchObject({ code: 'INTERNAL_ERROR', status: 500, stage: 'db', cause: failure });
    expect(storage.deleteObject).toHaveBeenCalledTimes(operation === 'create' || operation === 'replace' ? 1 : 0);
  });

  it('delete storage lỗi vẫn thành công, có storage.orphan và storage.delete', async () => {
    const { service, storage, lines } = setup();
    storage.deleteObject.mockRejectedValue(new StorageError('UNAVAILABLE', 'offline'));
    await expect(service.delete(doc)).resolves.toBeUndefined();
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 40, event: 'storage.orphan', stage: 'storage.delete' });
  });
});
