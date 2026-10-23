import { Prisma, type FileType, type PrismaClient, type Visibility } from '@prisma/client';

const ownerSelect = { owner: { select: { id: true, displayName: true } } } as const;

export type DocumentWithOwner = Prisma.DocumentGetPayload<{ include: typeof ownerSelect }>;

export type DocumentScope = { kind: 'public' } | { kind: 'owner'; ownerId: string };

export interface DocumentSearch {
  scope: DocumentScope;
  q?: string | undefined;
  fileType?: FileType | undefined;
  visibility?: Visibility | undefined;
  sort: 'newest' | 'title';
  page: number;
  pageSize: number;
}

export interface NewDocumentRow {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  visibility: Visibility;
  fileType: FileType;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
  updatedAt: Date;
  fileUpdatedAt: Date;
}

export interface FileColumns {
  storageKey: string;
  fileType: FileType;
  mimeType: string;
  originalFilename: string;
  sizeBytes: number;
}

/** Escape ký tự đặc biệt của LIKE với ký tự escape '!' (§A7.6, AC-02.3). */
export function escapeLike(value: string): string {
  return value.replace(/[!%_]/g, (char) => `!${char}`);
}

export class DocumentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string): Promise<DocumentWithOwner | null> {
    return this.prisma.document.findUnique({ where: { id }, include: ownerSelect });
  }

  /**
   * Tìm kiếm/kho cá nhân (§A4.4). Điều kiện quyền luôn nằm trong SQL: `visibility='PUBLIC'` hoặc
   * `owner_id = ?`. Bước 1 lấy id + tổng bằng SQL thô (LIKE có ESCAPE), bước 2 nạp bản ghi kèm owner.
   */
  async search(search: DocumentSearch): Promise<{ rows: DocumentWithOwner[]; total: number }> {
    const conditions: Prisma.Sql[] = [
      search.scope.kind === 'public' ? Prisma.sql`d.visibility = 'PUBLIC'` : Prisma.sql`d.owner_id = ${search.scope.ownerId}`,
    ];
    if (search.visibility) conditions.push(Prisma.sql`d.visibility = ${search.visibility}`);
    if (search.fileType) conditions.push(Prisma.sql`d.file_type = ${search.fileType}`);
    if (search.q) {
      const pattern = `%${escapeLike(search.q)}%`;
      conditions.push(Prisma.sql`(d.title LIKE ${pattern} ESCAPE '!' OR d.description LIKE ${pattern} ESCAPE '!')`);
    }
    const where = Prisma.join(conditions, ' AND ');
    const orderBy = search.sort === 'title' ? Prisma.sql`d.title ASC, d.id ASC` : Prisma.sql`d.created_at DESC, d.id DESC`;
    const offset = (search.page - 1) * search.pageSize;

    const [countRows, idRows] = await Promise.all([
      this.prisma.$queryRaw<Array<{ total: bigint | number }>>`SELECT COUNT(*) AS total FROM documents d WHERE ${where}`,
      this.prisma.$queryRaw<Array<{ id: string }>>`SELECT d.id FROM documents d WHERE ${where} ORDER BY ${orderBy} LIMIT ${search.pageSize} OFFSET ${offset}`,
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) return { rows: [], total };

    const rows = await this.prisma.document.findMany({ where: { id: { in: ids } }, include: ownerSelect });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return { rows: ids.map((id) => byId.get(id)).filter((row): row is DocumentWithOwner => row !== undefined), total };
  }

  async insert(row: NewDocumentRow): Promise<void> {
    await this.prisma.document.create({ data: { ...row, fileVersion: 1 } });
  }

  /** Ném P2025 nếu tài liệu đã bị xoá đồng thời. Không bao giờ chạm cột tệp (INV-D2 chiều ngược). */
  updateMetadata(
    id: string,
    patch: { title?: string; description?: string | null; visibility?: Visibility },
    now: Date,
  ): Promise<DocumentWithOwner> {
    return this.prisma.document.update({ where: { id }, data: { ...patch, updatedAt: now }, include: ownerSelect });
  }

  /** Last write wins; không cập nhật visibility. */
  async updateFile(id: string, file: FileColumns, now: Date): Promise<number> {
    const result = await this.prisma.document.updateMany({
      where: { id },
      data: { ...file, fileVersion: { increment: 1 }, fileUpdatedAt: now, updatedAt: now },
    });
    return result.count;
  }

  delete(id: string): Promise<DocumentWithOwner> {
    return this.prisma.document.delete({ where: { id }, include: ownerSelect });
  }
}
