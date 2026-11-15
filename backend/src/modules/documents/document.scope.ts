import { Prisma } from '@prisma/client';

/** SQL fragments require documents alias d. */
export function discoverableSql(): Prisma.Sql {
  return Prisma.sql`d.visibility = 'PUBLIC' AND EXISTS (SELECT 1 FROM users u WHERE u.id = d.owner_id AND u.deletion_started_at IS NULL)`;
}

export function duplicateScopeSql(ownerId: string): Prisma.Sql {
  return Prisma.sql`(d.owner_id = ${ownerId} OR (${discoverableSql()}))`;
}
