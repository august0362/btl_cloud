import { expect, it } from 'vitest';
import { discoverableSql, duplicateScopeSql } from '../../src/modules/documents/document.scope.js';

it('centralizes public/non-deleting scope and parameterizes owner scope', () => {
  expect(discoverableSql().sql).toContain("d.visibility = 'PUBLIC'");
  expect(discoverableSql().sql).toContain('u.deletion_started_at IS NULL');
  const scope = duplicateScopeSql("owner' OR 1=1");
  expect(scope.sql).toContain('d.owner_id = ? OR');
  expect(scope.values).toEqual(["owner' OR 1=1"]);
});
