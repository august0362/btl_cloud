> Hồ sơ lịch sử: [PR #1](https://github.com/august0362/btl_cloud/pull/1) đã được gộp vào main. Các số liệu dưới đây thuộc lượt M4; xem MILESTONES cho phần còn chờ nghiệm thu.

Tích hợp local prototype để nhóm tiếp tục phát triển.

- CR-006: một bảng màu sáng/tối theo hệ thống; bỏ picker, provider, palette/PNG và theme test.
- CR-007: bỏ guard, cleanup table/worker/grace và optimistic concurrency; immutable key, fileVersion counter, last-write-wins; object deletion best-effort với WARN storage.orphan; migration mới, giữ nguyên init.
- CR-008: rút gọn baseline, README tiếng Việt và bằng chứng M4 cho nhóm.
- Nâng Vitest backend 3 → 5.0.5 theo owner đồng ý ngày 2026-10-23, loại CRITICAL advisories.

| M4 | Kết quả / bằng chứng |
|---|---|
| 01 | PASS: run.bat, health/ready 200, luồng dev :5173 register → upload → My documents → Explore |
| 02 | PASS: build hai phía, SERVE_FRONTEND=true, reload SPA, asset immutable, CSRF |
| 03 | PASS: contract/client tests và bảng F-01…F-18 trong MILESTONES |
| 04 | PASS: Chromium E2E 9/9, ánh xạ FR-01…FR-09 |
| 05 | PASS: authz-matrix 82 checks Guest/A/B |
| 06 | PASS: upload-matrix 42 checks, PDF/DOCX/PPTX, 50 MiB/+1, fake/empty/UTF-8/SHA-256 |
| 07/08 | DEFERRED (CR-005), chưa tick |
| 09 | PASS: root npm ci/lint/build/test; backend unit 66, integration 74, frontend 61, E2E 9 |
| 10 | Không CRITICAL mở; còn SEC-002 HIGH advisory Prisma CLI → deepmerge-ts (3 packages báo HIGH) |
| 11 | PASS onboarding: clone ASCII, đăng ký/đăng xuất/đăng nhập :5173; clone đã stop. Xoá clone BLOCKED bởi automatic approval review |
| 12/G | [OWNER], chưa tick |

Đã sửa: selector E2E-03 khớp hai heading; route focus có thể giành focus form/dialog; Vitest/tinypool CRITICAL. Workaround môi trường DEBUG=release và Windows Prisma DLL lock được ghi trong README.

Thử nhanh: Node 24, chạy run.bat (Windows không Docker), vào http://localhost:5173/register; dừng bằng run.bat stop. Nhánh Docker có hướng dẫn, chưa chạy vì máy không có Docker. Prototype chấp nhận object mồ côi sau lỗi/crash và concurrent replace last-write-wins. Không thực hiện công việc AWS.

Việc owner còn cần làm: kiểm quyền cộng tác/branch protection và chạy M4-12/M4-G. Hồ sơ này không xác nhận nghiệm thu cuối hoặc triển khai AWS.

CI local và ci-required GitHub đã PASS tại 5922964: https://github.com/august0362/btl_cloud/actions/runs/39898331031. UI suite mock bổ sung: 7/7. Thống kê source/test/schema/tooling (không docs/JSON/lockfiles): xoá 1.738 dòng, giảm ròng 1.294 dòng, xoá 22 PNG. Bằng chứng đầy đủ: docs/MILESTONES.md.
