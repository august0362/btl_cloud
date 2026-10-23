import { describe, expect, it } from 'vitest';
import { safeParseIssues } from '../../src/http/validate.js';
import { loginSchema, registerSchema } from '../../src/modules/auth/auth.schemas.js';
import { createFieldsSchema, mineQuerySchema, patchSchema, publicQuerySchema } from '../../src/modules/documents/documents.schemas.js';

function issues(schema: Parameters<typeof safeParseIssues>[0], data: unknown) {
  const result = safeParseIssues(schema, data);
  return result.success ? [] : result.issues.map(({ field, issue }) => ({ field, issue }));
}

describe('registerSchema (§A7.5)', () => {
  it('chuẩn hoá email (trim + chữ thường) và trim tên hiển thị, không trim mật khẩu', () => {
    const result = safeParseIssues(registerSchema, { email: '  SV.A@Example.com ', password: ' matkhau1 ', displayName: '  Nguyễn Văn A ' });
    expect(result).toEqual({ success: true, data: { email: 'sv.a@example.com', password: ' matkhau1 ', displayName: 'Nguyễn Văn A' } });
  });

  it('trả issue đúng mã cho từng trường', () => {
    expect(issues(registerSchema, {})).toEqual([
      { field: 'email', issue: 'REQUIRED' },
      { field: 'password', issue: 'REQUIRED' },
      { field: 'displayName', issue: 'REQUIRED' },
    ]);
    expect(issues(registerSchema, { email: 'khong-hop-le', password: 'ngan', displayName: '   ' })).toEqual([
      { field: 'email', issue: 'INVALID_FORMAT' },
      { field: 'password', issue: 'TOO_SHORT' },
      { field: 'displayName', issue: 'REQUIRED' },
    ]);
    expect(issues(registerSchema, { email: 'a@b.co', password: 'x'.repeat(129), displayName: 'A'.repeat(101) })).toEqual([
      { field: 'password', issue: 'TOO_LONG' },
      { field: 'displayName', issue: 'TOO_LONG' },
    ]);
    expect(issues(registerSchema, { email: 5, password: 'matkhau123', displayName: 'A' })).toEqual([{ field: 'email', issue: 'INVALID_TYPE' }]);
  });

  it('từ chối trường lạ với UNKNOWN_FIELD', () => {
    expect(issues(registerSchema, { email: 'a@b.co', password: 'matkhau123', displayName: 'A', role: 'admin' })).toEqual([
      { field: 'role', issue: 'UNKNOWN_FIELD' },
    ]);
  });

  it('đếm độ dài theo code point (emoji 2 code unit vẫn là 1 ký tự)', () => {
    expect(issues(registerSchema, { email: 'a@b.co', password: '😀'.repeat(8), displayName: '😀'.repeat(100) })).toEqual([]);
  });
});

describe('loginSchema', () => {
  it('mật khẩu 1–128 ký tự, không lộ chính sách 8 ký tự', () => {
    expect(issues(loginSchema, { email: 'a@b.co', password: 'x' })).toEqual([]);
    expect(issues(loginSchema, { email: 'a@b.co', password: '' })).toEqual([{ field: 'password', issue: 'REQUIRED' }]);
  });
});

describe('createFieldsSchema (API-10)', () => {
  it('bắt buộc visibility (BR-04) và tiêu đề không rỗng', () => {
    expect(issues(createFieldsSchema, { title: '  ' })).toEqual([
      { field: 'title', issue: 'TOO_SHORT' },
      { field: 'visibility', issue: 'REQUIRED' },
    ]);
  });

  it('tiêu đề không được chứa xuống dòng; mô tả "" → null; visibility phân biệt hoa thường', () => {
    expect(issues(createFieldsSchema, { title: 'a\nb', visibility: 'PUBLIC' })).toEqual([{ field: 'title', issue: 'INVALID_FORMAT' }]);
    expect(issues(createFieldsSchema, { title: 'a', visibility: 'public' })).toEqual([{ field: 'visibility', issue: 'INVALID_ENUM' }]);
    const ok = safeParseIssues(createFieldsSchema, { title: ' Đề cương ', description: '   ', visibility: 'PRIVATE' });
    expect(ok).toEqual({ success: true, data: { title: 'Đề cương', description: null, visibility: 'PRIVATE' } });
  });

  it('mô tả tối đa 2000 ký tự, cho phép xuống dòng', () => {
    expect(issues(createFieldsSchema, { title: 'a', description: 'dòng 1\ndòng 2\t', visibility: 'PUBLIC' })).toEqual([]);
    expect(issues(createFieldsSchema, { title: 'a', description: 'x'.repeat(2001), visibility: 'PUBLIC' })).toEqual([
      { field: 'description', issue: 'TOO_LONG' },
    ]);
  });
});

describe('patchSchema (API-11)', () => {
  it('body rỗng → NO_CHANGES trên field "body"', () => {
    expect(issues(patchSchema, {})).toEqual([{ field: 'body', issue: 'NO_CHANGES' }]);
  });
  it('title null → INVALID_TYPE; description null hợp lệ (xoá mô tả)', () => {
    expect(issues(patchSchema, { title: null })).toEqual([{ field: 'title', issue: 'INVALID_TYPE' }]);
    expect(safeParseIssues(patchSchema, { description: null })).toEqual({ success: true, data: { description: null } });
  });
  it('trường lạ → UNKNOWN_FIELD', () => {
    expect(issues(patchSchema, { visibility: 'PUBLIC', storageKey: 'x' })).toEqual([{ field: 'storageKey', issue: 'UNKNOWN_FIELD' }]);
  });
});

describe('query schema (API-07/08, §A7.6)', () => {
  it('mặc định page=1, pageSize=12, sort=newest; q rỗng → không lọc', () => {
    expect(safeParseIssues(publicQuerySchema, { q: '  ' })).toEqual({ success: true, data: { q: undefined, sort: 'newest', page: 1, pageSize: 12 } });
  });
  it('tham số sai → mã issue đúng; tham số lạ bị bỏ qua', () => {
    expect(issues(publicQuerySchema, { page: 'abc', pageSize: '51', sort: 'oldest', fileType: 'DOC', q: 'x'.repeat(101), foo: 'bar' })).toEqual([
      { field: 'q', issue: 'TOO_LONG' },
      { field: 'fileType', issue: 'INVALID_ENUM' },
      { field: 'sort', issue: 'INVALID_ENUM' },
      { field: 'page', issue: 'INVALID_TYPE' },
      { field: 'pageSize', issue: 'OUT_OF_RANGE' },
    ]);
    expect(issues(publicQuerySchema, { page: '0' })).toEqual([{ field: 'page', issue: 'OUT_OF_RANGE' }]);
  });
  it('kho cá nhân có thêm bộ lọc visibility', () => {
    expect(issues(mineQuerySchema, { visibility: 'HIDDEN' })).toEqual([{ field: 'visibility', issue: 'INVALID_ENUM' }]);
  });
});
