/**
 * Database schema integration tests.
 *
 * Verifies that the Prisma schema matches the approved ERD in §A4.3:
 * - 4 tables: users, sessions, documents, storage_cleanup_tasks
 * - Correct column types, nullability, defaults
 * - Primary keys, foreign keys, unique constraints, indexes
 * - Enum values for visibility, file_type, reason
 * - Relationships and cascading behavior
 *
 * Requires: MySQL running via docker-compose (btl_cloud_test database).
 * Viết bởi Antigravity (M1 database); CLAUDE_BACKEND nối vào hạ tầng integration chung
 * (global-setup áp migration), chuyển BigInt của SHOW INDEX sang number và thêm kiểm tra default updated_at.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TEST_ENV } from '../helpers/config.js';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: TEST_ENV.DATABASE_URL,
    },
  },
});

interface ColumnInfo {
  Field: string;
  Type: string;
  Null: string;
  Key: string;
  Default: string | null;
  Extra: string;
}

interface IndexInfo {
  Table: string;
  Non_unique: number | bigint;
  Key_name: string;
  Column_name: string;
  Seq_in_index: number | bigint;
}



interface ForeignKeyInfo {
  columnName: string;
  refTable: string;
  deleteRule: string;
}

/** SHOW CREATE TABLE qua Prisma trả cột tên f0/f1 → đọc FK từ information_schema thay thế. */
async function foreignKeys(table: string): Promise<ForeignKeyInfo[]> {
  return prisma.$queryRaw<ForeignKeyInfo[]>`
    SELECT kcu.COLUMN_NAME AS columnName, kcu.REFERENCED_TABLE_NAME AS refTable, rc.DELETE_RULE AS deleteRule
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    WHERE kcu.TABLE_SCHEMA = DATABASE() AND kcu.TABLE_NAME = ${table} AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
  `;
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Database connectivity', () => {
  it('should connect to MySQL and execute a query', async () => {
    const result = await prisma.$queryRaw<Array<{ result: number }>>`SELECT 1 as result`;
    expect(Number(result[0]?.result)).toBe(1);
  });

  it('should use utf8mb4_0900_ai_ci collation', async () => {
    const result = await prisma.$queryRaw<Array<{ collation: string }>>`
      SELECT DEFAULT_COLLATION_NAME as collation
      FROM INFORMATION_SCHEMA.SCHEMATA
      WHERE SCHEMA_NAME = DATABASE()
    `;
    expect(result[0]?.collation).toBe('utf8mb4_0900_ai_ci');
  });
});

describe('Table: users (§A4.3)', () => {
  it('should have the correct columns', async () => {
    const columns = await prisma.$queryRaw<ColumnInfo[]>`DESCRIBE users`;
    const columnMap = new Map(columns.map(c => [c.Field, c]));

    // id - CHAR(36) PK NOT NULL
    expect(columnMap.get('id')?.Type).toBe('char(36)');
    expect(columnMap.get('id')?.Null).toBe('NO');
    expect(columnMap.get('id')?.Key).toBe('PRI');

    // email - VARCHAR(254) NOT NULL UNIQUE
    expect(columnMap.get('email')?.Type).toBe('varchar(254)');
    expect(columnMap.get('email')?.Null).toBe('NO');
    expect(columnMap.get('email')?.Key).toBe('UNI');

    // password_hash - VARCHAR(255) NOT NULL
    expect(columnMap.get('password_hash')?.Type).toBe('varchar(255)');
    expect(columnMap.get('password_hash')?.Null).toBe('NO');

    // display_name - VARCHAR(100) NOT NULL
    expect(columnMap.get('display_name')?.Type).toBe('varchar(100)');
    expect(columnMap.get('display_name')?.Null).toBe('NO');

    // created_at - DATETIME(3) NOT NULL
    expect(columnMap.get('created_at')?.Type).toBe('datetime(3)');
    expect(columnMap.get('created_at')?.Null).toBe('NO');

    // updated_at - DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) (§A4.3)
    expect(columnMap.get('updated_at')?.Type).toBe('datetime(3)');
    expect(columnMap.get('updated_at')?.Null).toBe('NO');
    expect(columnMap.get('updated_at')?.Default).toBe('CURRENT_TIMESTAMP(3)');
  });

  it('should have unique constraint on email (uq_users_email)', async () => {
    const indexes = await prisma.$queryRaw<IndexInfo[]>`SHOW INDEX FROM users WHERE Key_name = 'uq_users_email'`;
    expect(indexes.length).toBe(1);
    expect(indexes[0]?.Column_name).toBe('email');
    expect(Number(indexes[0]?.Non_unique)).toBe(0);
  });
});

describe('Table: sessions (§A4.3)', () => {
  it('should have the correct columns', async () => {
    const columns = await prisma.$queryRaw<ColumnInfo[]>`DESCRIBE sessions`;
    const columnMap = new Map(columns.map(c => [c.Field, c]));

    // id - CHAR(64) PK NOT NULL
    expect(columnMap.get('id')?.Type).toBe('char(64)');
    expect(columnMap.get('id')?.Null).toBe('NO');
    expect(columnMap.get('id')?.Key).toBe('PRI');

    // user_id - CHAR(36) NOT NULL FK
    expect(columnMap.get('user_id')?.Type).toBe('char(36)');
    expect(columnMap.get('user_id')?.Null).toBe('NO');

    // created_at - DATETIME(3) NOT NULL
    expect(columnMap.get('created_at')?.Type).toBe('datetime(3)');
    expect(columnMap.get('created_at')?.Null).toBe('NO');

    // expires_at - DATETIME(3) NOT NULL
    expect(columnMap.get('expires_at')?.Type).toBe('datetime(3)');
    expect(columnMap.get('expires_at')?.Null).toBe('NO');
  });

  it('should have FK to users with ON DELETE CASCADE', async () => {
    expect(await foreignKeys('sessions')).toEqual([{ columnName: 'user_id', refTable: 'users', deleteRule: 'CASCADE' }]);
  });

  it('should have idx_sessions_user_id index', async () => {
    const indexes = await prisma.$queryRaw<IndexInfo[]>`SHOW INDEX FROM sessions WHERE Key_name = 'idx_sessions_user_id'`;
    expect(indexes.length).toBe(1);
    expect(indexes[0]?.Column_name).toBe('user_id');
  });

  it('should have idx_sessions_expires_at index', async () => {
    const indexes = await prisma.$queryRaw<IndexInfo[]>`SHOW INDEX FROM sessions WHERE Key_name = 'idx_sessions_expires_at'`;
    expect(indexes.length).toBe(1);
    expect(indexes[0]?.Column_name).toBe('expires_at');
  });
});

describe('Table: documents (§A4.3)', () => {
  it('should have the correct columns', async () => {
    const columns = await prisma.$queryRaw<ColumnInfo[]>`DESCRIBE documents`;
    const columnMap = new Map(columns.map(c => [c.Field, c]));

    // id - CHAR(36) PK NOT NULL
    expect(columnMap.get('id')?.Type).toBe('char(36)');
    expect(columnMap.get('id')?.Null).toBe('NO');
    expect(columnMap.get('id')?.Key).toBe('PRI');

    // owner_id - CHAR(36) NOT NULL FK
    expect(columnMap.get('owner_id')?.Type).toBe('char(36)');
    expect(columnMap.get('owner_id')?.Null).toBe('NO');

    // title - VARCHAR(200) NOT NULL
    expect(columnMap.get('title')?.Type).toBe('varchar(200)');
    expect(columnMap.get('title')?.Null).toBe('NO');

    // description - VARCHAR(2000) YES (nullable)
    expect(columnMap.get('description')?.Type).toBe('varchar(2000)');
    expect(columnMap.get('description')?.Null).toBe('YES');

    // visibility - ENUM('PUBLIC','PRIVATE') NOT NULL, NO DEFAULT
    expect(columnMap.get('visibility')?.Type).toContain("enum('PUBLIC','PRIVATE')");
    expect(columnMap.get('visibility')?.Null).toBe('NO');
    expect(columnMap.get('visibility')?.Default).toBeNull();

    // file_type - ENUM('PDF','DOCX','PPTX') NOT NULL
    expect(columnMap.get('file_type')?.Type).toContain("enum('PDF','DOCX','PPTX')");
    expect(columnMap.get('file_type')?.Null).toBe('NO');

    // mime_type - VARCHAR(100) NOT NULL
    expect(columnMap.get('mime_type')?.Type).toBe('varchar(100)');
    expect(columnMap.get('mime_type')?.Null).toBe('NO');

    // original_filename - VARCHAR(255) NOT NULL
    expect(columnMap.get('original_filename')?.Type).toBe('varchar(255)');
    expect(columnMap.get('original_filename')?.Null).toBe('NO');

    // size_bytes - INT UNSIGNED NOT NULL
    expect(columnMap.get('size_bytes')?.Type).toBe('int unsigned');
    expect(columnMap.get('size_bytes')?.Null).toBe('NO');

    // storage_key - VARCHAR(512) NOT NULL UNIQUE
    expect(columnMap.get('storage_key')?.Type).toBe('varchar(512)');
    expect(columnMap.get('storage_key')?.Null).toBe('NO');
    expect(columnMap.get('storage_key')?.Key).toBe('UNI');

    // file_version - INT UNSIGNED NOT NULL DEFAULT 1
    expect(columnMap.get('file_version')?.Type).toBe('int unsigned');
    expect(columnMap.get('file_version')?.Null).toBe('NO');
    expect(columnMap.get('file_version')?.Default).toBe('1');

    // created_at, updated_at - DATETIME(3) NOT NULL
    expect(columnMap.get('created_at')?.Type).toBe('datetime(3)');
    expect(columnMap.get('created_at')?.Null).toBe('NO');
    expect(columnMap.get('updated_at')?.Type).toBe('datetime(3)');
    expect(columnMap.get('updated_at')?.Null).toBe('NO');

    // file_updated_at - DATETIME(3) NOT NULL
    expect(columnMap.get('file_updated_at')?.Type).toBe('datetime(3)');
    expect(columnMap.get('file_updated_at')?.Null).toBe('NO');
  });

  it('should have FK to users with ON DELETE RESTRICT', async () => {
    expect(await foreignKeys('documents')).toEqual([{ columnName: 'owner_id', refTable: 'users', deleteRule: 'RESTRICT' }]);
  });

  it('should have unique constraint on storage_key (uq_documents_storage_key)', async () => {
    const indexes = await prisma.$queryRaw<IndexInfo[]>`SHOW INDEX FROM documents WHERE Key_name = 'uq_documents_storage_key'`;
    expect(indexes.length).toBe(1);
    expect(indexes[0]?.Column_name).toBe('storage_key');
    expect(Number(indexes[0]?.Non_unique)).toBe(0);
  });

  it('should have idx_documents_visibility_created composite index', async () => {
    const indexes = await prisma.$queryRaw<IndexInfo[]>`SHOW INDEX FROM documents WHERE Key_name = 'idx_documents_visibility_created'`;
    expect(indexes.length).toBe(2);
    const sorted = indexes.sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index));
    expect(sorted[0]?.Column_name).toBe('visibility');
    expect(sorted[1]?.Column_name).toBe('created_at');
  });

  it('should have idx_documents_owner_created composite index', async () => {
    const indexes = await prisma.$queryRaw<IndexInfo[]>`SHOW INDEX FROM documents WHERE Key_name = 'idx_documents_owner_created'`;
    expect(indexes.length).toBe(2);
    const sorted = indexes.sort((a, b) => Number(a.Seq_in_index) - Number(b.Seq_in_index));
    expect(sorted[0]?.Column_name).toBe('owner_id');
    expect(sorted[1]?.Column_name).toBe('created_at');
  });

  it('visibility should have no default value (BR-04)', async () => {
    const columns = await prisma.$queryRaw<ColumnInfo[]>`DESCRIBE documents`;
    const visibility = columns.find(c => c.Field === 'visibility');
    expect(visibility?.Default).toBeNull();
  });
});

describe('Table: storage_cleanup_tasks (§A4.3)', () => {
  it('should have the correct columns', async () => {
    const columns = await prisma.$queryRaw<ColumnInfo[]>`DESCRIBE storage_cleanup_tasks`;
    const columnMap = new Map(columns.map(c => [c.Field, c]));

    // id - BIGINT UNSIGNED AUTO_INCREMENT PK
    expect(columnMap.get('id')?.Type).toBe('bigint unsigned');
    expect(columnMap.get('id')?.Null).toBe('NO');
    expect(columnMap.get('id')?.Key).toBe('PRI');
    expect(columnMap.get('id')?.Extra).toContain('auto_increment');

    // storage_key - VARCHAR(512) NOT NULL UNIQUE
    expect(columnMap.get('storage_key')?.Type).toBe('varchar(512)');
    expect(columnMap.get('storage_key')?.Null).toBe('NO');
    expect(columnMap.get('storage_key')?.Key).toBe('UNI');

    // reason - ENUM('UPLOAD_GUARD','REPLACED','DELETED') NOT NULL
    expect(columnMap.get('reason')?.Type).toContain("enum('UPLOAD_GUARD','REPLACED','DELETED')");
    expect(columnMap.get('reason')?.Null).toBe('NO');

    // document_id - CHAR(36) YES (nullable, NOT FK)
    expect(columnMap.get('document_id')?.Type).toBe('char(36)');
    expect(columnMap.get('document_id')?.Null).toBe('YES');

    // attempts - INT UNSIGNED NOT NULL DEFAULT 0
    expect(columnMap.get('attempts')?.Type).toBe('int unsigned');
    expect(columnMap.get('attempts')?.Null).toBe('NO');
    expect(columnMap.get('attempts')?.Default).toBe('0');

    // next_attempt_at - DATETIME(3) NOT NULL
    expect(columnMap.get('next_attempt_at')?.Type).toBe('datetime(3)');
    expect(columnMap.get('next_attempt_at')?.Null).toBe('NO');

    // last_error - VARCHAR(1000) YES (nullable)
    expect(columnMap.get('last_error')?.Type).toBe('varchar(1000)');
    expect(columnMap.get('last_error')?.Null).toBe('YES');

    // created_at, updated_at - DATETIME(3) NOT NULL
    expect(columnMap.get('created_at')?.Type).toBe('datetime(3)');
    expect(columnMap.get('created_at')?.Null).toBe('NO');
    expect(columnMap.get('updated_at')?.Type).toBe('datetime(3)');
    expect(columnMap.get('updated_at')?.Null).toBe('NO');
  });

  it('should NOT have FK to documents (design decision D-07)', async () => {
    expect(await foreignKeys('storage_cleanup_tasks')).toEqual([]);
  });

  it('should have unique constraint on storage_key (uq_cleanup_storage_key)', async () => {
    const indexes = await prisma.$queryRaw<IndexInfo[]>`SHOW INDEX FROM storage_cleanup_tasks WHERE Key_name = 'uq_cleanup_storage_key'`;
    expect(indexes.length).toBe(1);
    expect(indexes[0]?.Column_name).toBe('storage_key');
    expect(Number(indexes[0]?.Non_unique)).toBe(0);
  });

  it('should have idx_cleanup_next_attempt index', async () => {
    const indexes = await prisma.$queryRaw<IndexInfo[]>`SHOW INDEX FROM storage_cleanup_tasks WHERE Key_name = 'idx_cleanup_next_attempt'`;
    expect(indexes.length).toBe(1);
    expect(indexes[0]?.Column_name).toBe('next_attempt_at');
  });
});

describe('Relationships', () => {
  it('should have exactly 4 tables', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name AS table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE '_prisma_%'
      ORDER BY table_name
    `;
    const tableNames = tables.map(t => t.table_name);
    expect(tableNames).toEqual(
      expect.arrayContaining(['users', 'sessions', 'documents', 'storage_cleanup_tasks'])
    );
    // Filter out Prisma internal tables
    const appTables = tableNames.filter(t => !t.startsWith('_prisma'));
    expect(appTables.length).toBe(4);
  });

  it('all tables should use InnoDB engine', async () => {
    const tables = await prisma.$queryRaw<Array<{ TABLE_NAME: string; ENGINE: string }>>`
      SELECT TABLE_NAME, ENGINE
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE '_prisma_%'
    `;
    for (const table of tables) {
      expect(table.ENGINE).toBe('InnoDB');
    }
  });
});

