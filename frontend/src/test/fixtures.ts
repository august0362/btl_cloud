import type { DocumentDto, Page, UserDto } from "../api/types";

export const user: UserDto = {
  id: "9a1c7d42-5b3e-4f10-8c2d-6e7f8a9b0c1d",
  email: "sv.a@example.com",
  displayName: "Nguyễn Văn A",
  createdAt: "2026-10-20T08:00:00.000Z",
};
export const documentFixture: DocumentDto = {
  id: "3f2b6c1e-8a4d-4f7e-9c2a-1b5d7e9f0a12",
  title: "Đề cương Giải tích 1",
  description: "Tổng hợp công thức chương 1–3",
  visibility: "PUBLIC",
  fileType: "PDF",
  originalFilename: "Đề cương Giải tích 1.pdf",
  sizeBytes: 1048576,
  fileVersion: 1,
  owner: { id: user.id, displayName: user.displayName },
  isOwner: true,
  createdAt: "2026-10-20T08:30:00.000Z",
  updatedAt: "2026-10-20T08:30:00.000Z",
  fileUpdatedAt: "2026-10-20T08:30:00.000Z",
};
export const pageOf = (
  items: DocumentDto[] = [documentFixture],
  totalItems = items.length,
): Page<DocumentDto> => ({
  items,
  page: 1,
  pageSize: 12,
  totalItems,
  totalPages: Math.ceil(totalItems / 12),
});
export const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ data }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
export const errorResponse = (
  code: string,
  status: number,
  details: { field: string; issue: string; message: string }[] = [],
) =>
  new Response(
    JSON.stringify({
      error: {
        code,
        message: "Lỗi thử nghiệm.",
        details,
        requestId: "test-request",
      },
    }),
    { status, headers: { "X-Request-Id": "test-request" } },
  );
