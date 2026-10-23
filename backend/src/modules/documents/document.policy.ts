/** Nguồn duy nhất cho quyết định phân quyền tài liệu (§A5.5, RK-02). Hàm thuần. */
export type Decision = 'ALLOW' | 'NOT_FOUND' | 'FORBIDDEN';

export interface PolicyDocument {
  ownerId: string;
  visibility: 'PUBLIC' | 'PRIVATE';
}

export interface Viewer {
  userId: string;
}

/** Xem metadata / tải xuống: Public cho mọi người, Private chỉ owner; còn lại coi như không tồn tại. */
export function canView(doc: PolicyDocument, viewer: Viewer | null): Decision {
  if (doc.visibility === 'PUBLIC') return 'ALLOW';
  if (viewer && viewer.userId === doc.ownerId) return 'ALLOW';
  return 'NOT_FOUND';
}

/** Sửa / thay tệp / xoá: chỉ owner; Public của người khác → 403, Private → 404. */
export function canManage(doc: PolicyDocument, viewer: Viewer): Decision {
  if (viewer.userId === doc.ownerId) return 'ALLOW';
  return doc.visibility === 'PUBLIC' ? 'FORBIDDEN' : 'NOT_FOUND';
}
