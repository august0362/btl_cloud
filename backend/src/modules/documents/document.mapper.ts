import type { DocumentWithOwner } from './document.repository.js';

/** DocumentDto theo ARCHITECTURE §A7.4 — mọi trường luôn có mặt; owner không có email. */
export interface DocumentDto {
  id: string;
  title: string;
  description: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  fileType: 'PDF' | 'DOCX' | 'PPTX';
  originalFilename: string;
  sizeBytes: number;
  fileVersion: number;
  owner: { id: string; displayName: string };
  isOwner: boolean;
  createdAt: string;
  updatedAt: string;
  fileUpdatedAt: string;
}

export interface PageDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export function toDocumentDto(row: DocumentWithOwner, viewerUserId: string | null | undefined): DocumentDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    fileType: row.fileType,
    originalFilename: row.originalFilename,
    sizeBytes: Number(row.sizeBytes),
    fileVersion: Number(row.fileVersion),
    owner: { id: row.owner.id, displayName: row.owner.displayName },
    isOwner: viewerUserId != null && viewerUserId === row.ownerId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    fileUpdatedAt: row.fileUpdatedAt.toISOString(),
  };
}

export function toPageDto<T>(items: T[], page: number, pageSize: number, totalItems: number): PageDto<T> {
  return { items, page, pageSize, totalItems, totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize) };
}
