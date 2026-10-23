import { describe, expect, it } from 'vitest';
import { canManage, canView } from '../../src/modules/documents/document.policy.js';

const OWNER = { userId: 'owner' };
const OTHER = { userId: 'other' };
const publicDoc = { ownerId: 'owner', visibility: 'PUBLIC' as const };
const privateDoc = { ownerId: 'owner', visibility: 'PRIVATE' as const };

/** Ma trận CONTEXT §C3.2 (M2-05). */
describe('canView', () => {
  it.each([
    ['Guest', null, publicDoc, 'ALLOW'],
    ['Guest', null, privateDoc, 'NOT_FOUND'],
    ['User khác', OTHER, publicDoc, 'ALLOW'],
    ['User khác', OTHER, privateDoc, 'NOT_FOUND'],
    ['Owner', OWNER, publicDoc, 'ALLOW'],
    ['Owner', OWNER, privateDoc, 'ALLOW'],
  ] as const)('%s xem tài liệu %#', (_who, viewer, doc, expected) => {
    expect(canView(doc, viewer)).toBe(expected);
  });
});

describe('canManage', () => {
  it.each([
    ['User khác', OTHER, publicDoc, 'FORBIDDEN'],
    ['User khác', OTHER, privateDoc, 'NOT_FOUND'],
    ['Owner', OWNER, publicDoc, 'ALLOW'],
    ['Owner', OWNER, privateDoc, 'ALLOW'],
  ] as const)('%s quản lý tài liệu %#', (_who, viewer, doc, expected) => {
    expect(canManage(doc, viewer)).toBe(expected);
  });
});
