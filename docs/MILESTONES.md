# MILESTONES — Tiến độ, CR và nghiệm thu

> Yêu cầu: [PROJECT_OVERVIEW](PROJECT_OVERVIEW.md). Thiết kế: [ARCHITECTURE](ARCHITECTURE.md). Bằng chứng chi tiết của từng task trước khi rút gọn tài liệu nằm trong lịch sử Git.
>
> `OWNER_APPROVED_M0: YES` (20/10/2026) · `EXTENSIONS_APPROVED: YES` — E1–E3, E6–E8 (CR-009, 30/10/2026); E4–E5 hoãn.

## Quy tắc

- Nhánh `feature/*`, `fix/*`, `chore/*`; PR vào `main` cần CI `ci-required` và code owner review.
- Chỉ tick task đã kiểm chứng, kèm một dòng bằng chứng. Ô **[OWNER]**, các gate `-G` và FINAL OWNER ACCEPTANCE chỉ owner tick.
- Thay đổi phạm vi, hợp đồng API hay quyết định đã duyệt: ghi CR vào [Nhật ký thay đổi](#nhật-ký-thay-đổi-baseline) và chờ owner duyệt.
- Khi trạng thái ở đây đổi, sửa [PROJECT_OVERVIEW §0.3](PROJECT_OVERVIEW.md#03-trạng-thái) trong cùng PR.
- Migration trên DB có dữ liệu: sao lưu trước, áp bằng `prisma:deploy`, không reset.

## Tổng quan

| Milestone | Phạm vi | Trạng thái |
|---|---|---|
| M0 | Yêu cầu, kiến trúc, UX/UI | Xong, owner duyệt |
| M1–M2 | Backend, DB, storage, xác thực, tài liệu | Xong (trừ M1-00, M1-03 cần Docker thật) |
| M3 | Frontend | Xong (M3-01 chưa tick riêng, đã kiểm lại ở M4) |
| M4 | Tích hợp, kiểm chứng local | 01…06, 09…11 PASS; 07/08 hoãn (CR-005); chờ M4-12, M4-G |
| M5 | Chuẩn bị AWS | Chưa làm |
| E1–E8 | Mở rộng tuỳ chọn | E1–E3, E6–E8 xong phần agent; chờ E1-07 và gate owner; E4–E5 hoãn |

## M0–M3

Hoàn thành theo baseline 1.0: yêu cầu FR/AC/BR/NFR, 12 use case, kiến trúc, schema, bảo mật, hợp đồng API-01…14, đặc tả UI P-01…08, sơ đồ tuần tự. Backend (M1–M2) và frontend (M3) đã triển khai, test nằm trong `backend/test/` và `frontend/`, được chạy lại ở M4.

Còn mở:
- [ ] **M1-00** [OWNER] Docker Desktop/WSL2: `docker compose version` và `docker run --rm hello-world`.
- [ ] **M1-03** Chạy Compose thật: `docker compose up -d --wait`, init bucket dev/test, xác minh từ chối truy cập object ẩn danh.
- [ ] **M3-01** Xác nhận riêng nền tảng Vite/React/TS từ root (phần ứng dụng đã kiểm ở M4).

## M4 — Tích hợp và kiểm chứng local

- [x] **M4-01** Ghép M1–M3, chạy dev: `run.bat` exit 0; health/ready 200; :5173 đăng ký → upload → My documents → Explore PASS.
- [x] **M4-02** Production-like cùng origin: build BE/FE, `SERVE_FRONTEND=true`; reload SPA, asset immutable, CSRF PASS.
- [x] **M4-03** Tương thích API: contract API-01…14 trong integration; F-01…F-18 (hành động UI → API) đều PASS.
- [x] **M4-04** E2E FR-01…FR-09: Playwright 9/9 trên :3000, không mock backend.
- [x] **M4-05** Ma trận phân quyền Guest/A/B: `authz-matrix.mjs` 82/82.
- [x] **M4-06** Ma trận upload/download: `upload-matrix.mjs` 42/42 (3 loại, 50 MiB/+1, giả/rỗng/UTF-8, SHA-256).
- [ ] **M4-07** Lỗi storage thật khi dừng dịch vụ — DEFERRED (CR-005).
- [ ] **M4-08** Nhiều instance — DEFERRED (CR-005).
- [x] **M4-09** Kiểm tra tự động (23/10/2026, Node 24.19.0): root CI exit 0; integration 74, frontend 61, E2E 9 PASS.
- [x] **M4-10** Sổ lỗi: BUG-001, TEST-001, SEC-001 đã sửa; không còn CRITICAL; SEC-002 còn mở.
- [x] **M4-11** README và clone sạch: clone vào `C:\tmp\btl-clone`, `run.bat`, đăng ký/đăng xuất/đăng nhập PASS.
- [ ] **M4-12** [OWNER] Diễn tập demo local (phần 2–5 phút): đăng nhập → tải lên → tìm kiếm → kiểm tra Public/Private.
- [ ] **M4-G** [OWNER] Gate M4: ghi "ĐỒNG Ý" hoặc danh sách cần sửa.

Các lượt kiểm trong đợt E1–E8 (30/10/2026) ghi nhận: lint/build/test gốc PASS (backend unit 122, frontend 101), `test:integration` 89/89, `node --test backend/dev/*.test.mjs` 36/36, `authz-matrix` 82/82, `upload-matrix` 42/42, `admin-isolation` PASS. PR #1 (M4) và PR #2 (launcher, đăng nhập developer, bàn giao) đã gộp vào `main`.

## M5 — Chuẩn bị AWS

Mỗi task: đầu ra là bảng cấu hình hoặc bản nháp trong `deploy/`, owner review. Thiết kế nền: [§A10.7–A10.8](ARCHITECTURE.md#a107-thiết-kế-aws-mục-tiêu-m5-chưa-provisioning).

- [ ] **M5-01** Rà soát stateless: trạng thái trong bộ nhớ, file ngoài `UPLOAD_TMP_DIR`, phụ thuộc hostname/cổng.
- [ ] **M5-02** Triển khai EC2: chốt OD-06; artifact, Node runtime, systemd unit, user data, bước migration; không bước nào cần access key.
- [ ] **M5-03** RDS: 8.4, class, Single-AZ, subnet group, SG, TLS, backup, charset, user/quyền, bí mật (OD-07).
- [ ] **M5-04** S3: tên bucket, Block Public Access, Ownership, SSE-S3, **tắt versioning**, lifecycle huỷ multipart, Gateway Endpoint + route table.
- [ ] **M5-05** ALB/ASG: listener theo OD-05, health check, timeout, launch template, min 2 / desired 2 / max 4, scaling (OD-09), instance refresh.
- [ ] **M5-06** IAM: role, instance profile, policy có tên bucket thật; least privilege `documents/*`; `git grep -n "AKIA"` rỗng.
- [ ] **M5-07** CloudWatch: metric, 4 alarm, SNS, gửi log theo OD-06; **quy trình kích hoạt thử alarm** (dừng service → `UnHealthyHostCount`).
- [ ] **M5-08** Thử tải: kịch bản (ưu tiên `GET /api/documents`), cách tăng tải, điều kiện dừng; tiêu chí là **quan sát được** scale-out.
- [ ] **M5-09** Chi phí và mạng: dự toán lại bằng Pricing Calculator (NAT/endpoint/tên miền/IPv4); đối chiếu DS-03, DS-04; Service Quotas; AWS Budgets.
- [ ] **M5-10** Runbook triển khai AWS + rollback + teardown.
- [ ] **M5-G** [OWNER] Quyết định cho phép provisioning AWS.

## E1–E8 — Mở rộng

Owner chọn task tiếp theo. Task `commit` chạy `npm run lint && npm run build && npm test` (thêm `test:integration` khi chạm DB/API). Task `admin` kiểm bằng `ADMIN_TEST` = `npm --prefix backend exec -- vitest run --config admin/vitest.config.ts` trên máy owner.

| ID | Trạng thái | Task | Nơi mã | Bằng chứng (30/10/2026) |
|---|---|---|---|---|
| E0-01, 02 | [x] | Owner duyệt; ghi CR-009 | docs | Duyệt trong chat |
| E1-01 | [x] | Migration `last_active_at` + activity tracker | commit | `8610c9f`; integration `activity.test.ts` 3/3; số dòng không đổi |
| E1-02 | [x] | `.gitignore` admin; khung admin process | admin | `ADMIN_TEST` 13/13; `git ls-files` không có admin |
| E1-03 | [x] | Controller chạy admin, proxy; Vite bridge | commit | `node --test backend/dev` 36/36 |
| E1-04 | [x] | Chuyển panel developer vào admin; `admin-isolation.mjs` | admin + commit | `admin-isolation` PASS; clone sạch (bỏ thư mục admin) build/test PASS |
| E1-05 | [x] | ADM-01 Overview | admin | `ADMIN_TEST overview` 6/6 |
| E1-06 | [x] | Trang Dashboard | admin | RTL Dashboard 4/4 |
| E1-07 | [ ] | **[OWNER]** Sao lưu thư mục admin ra ngoài máy | — | — |
| E1-G | [ ] | **[OWNER]** Nghiệm thu E1 | — | — |
| E2-01 | [x] | Migration `deletion_started_at`; app public ẩn user `DELETING` | commit | `36db668`; `deleting-user.test.ts` 4/4; `authz-matrix` 82/82 |
| E2-02 | [x] | ADM-02, 03, 05, 06 | admin | `ADMIN_TEST users` 5/5 |
| E2-03 | [x] | ADM-07 xoá tài khoản | admin | `ADMIN_TEST deletion` 4/4 (gồm storage lỗi giữa chừng, bấm lại) |
| E2-04 | [x] | Trang Users và chi tiết user | admin | RTL Users 4/4 |
| E2-G | [ ] | **[OWNER]** Xoá tài khoản thử, dừng SeaweedFS giữa chừng rồi tiếp tục; bucket không còn object của user | — | — |
| E3-01 | [x] | Đo request/CPU/RAM/event loop; snapshot 5 s | commit | `8e47070`; `metrics.test.ts` 10/10 |
| E3-02 | [x] | Phần Hiệu năng + biểu đồ trực tiếp trên Dashboard | admin | RTL 6/6; `ADMIN_TEST overview` 7/7; autocannon 10 req/s → snapshot 10 |
| E3-03 | [x] | Seed thử tải + 3 kịch bản; nhận xét cache | commit | Xem [scripts/load/README.md](../scripts/load/README.md); không cần cache. Chênh lệch bật/tắt phần đo **chưa đo** (chưa có cờ tắt) |
| E3-G | [ ] | **[OWNER]** Xem dashboard khi đang thử tải | — | — |
| E6-01 | [x] | Chỉ báo độ mạnh mật khẩu | commit | 15 unit/RTL; `test:ui` 8/8 (axe 360/768/1280 px) |
| E6-G | [ ] | **[OWNER]** Xem bốn mức trên điện thoại và máy tính | — | — |
| E7-01 | [x] | Bảng `audit_events`, recorder, `audited()`, retention | commit | `793341b`; `audit.test.ts` unit 15/15, integration 5/5 |
| E7-02 | [x] | Gắn audit vào route auth, documents | commit | integration 89/89; `authz-matrix`, `upload-matrix` vẫn PASS |
| E7-03 | [x] | Trường `module`, `stage`, `code` trong log | commit | 25 unit |
| E7-04 | [x] | ADM-08 Activity, ADM-09 Errors, ADM-10 tra `requestId` | admin | `ADMIN_TEST activity` 3/3, `errors` 4/4; `:3000/api/admin/*` → 404 |
| E7-05 | [x] | Trang Activity Logs, Errors | admin | RTL Activity 2/2, Errors 3/3 |
| E7-06 | [x] | Audit thao tác admin; xoá audit khi xoá tài khoản | admin | `ADMIN_TEST audit` 5/5 |
| E7-G | [ ] | **[OWNER]** Gây lỗi storage khi upload, tìm theo `requestId`, xem Activity | — | — |
| E8-01…03, E8-G | [x] | Hướng dẫn đọc nhanh, diễn tập, quy tắc cập nhật | docs | Owner nghiệm thu 30/10/2026 |
| E4, E5 | DEFERRED | Hồ sơ/avatar, username, bạn bè | — | XOD-21; làm lại cần CR mới |

Ngoài kế hoạch, theo yêu cầu owner: trang admin **Trực tiếp** (ADM-11 người đang online, ADM-12 timeline request).

## Nhật ký thay đổi baseline

| CR | Thay đổi | Trạng thái |
|---|---|---|
| CR-000 | Design baseline v1.0 | APPROVED |
| CR-001 | Local storage dùng SeaweedFS 4.48 (MinIO không còn image miễn phí) | APPROVED |
| CR-002 | Prisma generate, `storage:init`, npm `allowScripts` | APPROVED |
| CR-003 | Prisma reset chỉ DB test, cần consent khi bị chặn | APPROVED |
| CR-004 | `run.bat` cho Windows có/không Docker | APPROVED |
| CR-005 | Hoãn M4-07 và M4-08 | APPROVED (23/10/2026) |
| CR-006 | Một bảng màu, bỏ picker/palette | APPROVED (23/10/2026) |
| CR-007 | DB ↔ storage best-effort, bỏ guard/worker/optimistic concurrency | APPROVED (23/10/2026) |
| CR-008 | Rút gọn tài liệu cho nhóm | APPROVED (23/10/2026) |
| CR-009 | Mở rộng E1–E3, E6–E8; audit một bảng `audit_events`, lỗi đọc từ log sẵn có (XOD-15…20); hoãn E4–E5 (XOD-21) | APPROVED (30/10/2026) |

## Lỗi tồn đọng

| ID | Mô tả | Mức | Trạng thái |
|---|---|---|---|
| SEC-002 | Prisma CLI → deepmerge-ts advisory HIGH; `npm audit` đề nghị Prisma major 7 | MAJOR | OPEN; cần kế hoạch nâng major riêng |
| ENV-001 | `DEBUG=release` trong môi trường làm SeaweedFS không lên | MINOR | Workaround trong README |
| ENV-002 | Windows khoá Prisma DLL nếu `npm ci` chạy cùng backend/test | MINOR | Workaround trong README |

Đã sửa ở M4: BUG-001 (selector E2E), TEST-001 (route focus giành focus form), SEC-001 (Vitest 3 → 5.0.5).

## FINAL OWNER ACCEPTANCE

> Agent **không bao giờ** tick mục này. Chỉ owner tick sau khi tự kiểm tra.

- [ ] **ACC-01** Bao phủ yêu cầu: 9/9 FR có UC, API, trang, test ([§A2](ARCHITECTURE.md#a2-use-case-và-truy-vết)); mọi AC PASS.
- [ ] **ACC-02** Use case: trên app đang chạy, chạy luồng chính và một luồng lỗi của UC-01…12.
- [ ] **ACC-03** Kiến trúc: cấu trúc repo khớp §A1.3; `git grep -n "@prisma/client" -- backend/src/modules/*/*.controller.ts` và `git grep -n "@aws-sdk" -- backend/src ":!backend/src/storage/s3-object-storage.ts"` không có kết quả.
- [ ] **ACC-04** CSDL: `SHOW CREATE TABLE users / sessions / documents` khớp §A4.3 (PK, FK, UNIQUE, index; `visibility` không mặc định).
- [ ] **ACC-05** API ↔ frontend: DevTools › Network khi tìm, tải lên, sửa, xoá khớp §A7 (tên trường, mã trạng thái, envelope).
- [ ] **ACC-06** Xác thực: cookie phiên HttpOnly, không có trong `document.cookie`/localStorage; sau đăng xuất `curl -b "sid=<cũ>" http://localhost:3000/api/documents/mine` → 401.
- [ ] **ACC-07** Public/Private: B không thấy Private của A, mở chi tiết/tải → 404; Guest bấm tải Public → chuyển tới đăng nhập.
- [ ] **ACC-08** Upload: 3 loại hợp lệ thành công; > 50 MB, `.txt` đổi tên `.pdf`, chưa chọn chế độ đều bị từ chối với thông báo tiếng Việt.
- [ ] **ACC-09** Upload thất bại: dừng SeaweedFS rồi tải lên → báo lỗi, không có tài liệu mới.
- [ ] **ACC-10** Thay tệp: thay rồi tải ra nội dung mới, chế độ giữ nguyên; dừng storage rồi thay → báo lỗi, vẫn ra tệp cũ; object cũ không còn trong bucket.
- [ ] **ACC-11** Xoá: 404 ở mọi nơi, object mất; dừng storage rồi xoá → vẫn báo thành công, có log `storage.orphan`.
- [ ] **ACC-12** Dễ dùng: desktop và 360 px; một lần tải lên chỉ bằng bàn phím; trạng thái rỗng và lỗi dễ hiểu.
- [ ] **ACC-13** Tái lập: ở clone mới, làm theo README; `npm ci && npm run lint && npm run build && npm test`, `test:integration`, `test:e2e` đều exit 0.
- [ ] **ACC-14** Nhiều instance (M4-08): hai backend `:3000`, `:3002` dùng chung phiên; `instanceId` khác nhau.
- [ ] **ACC-15** Sẵn sàng AWS: M5-01…10 xong; OD-05/06/07/09 đã quyết; dự toán có nguồn; `git grep -nE "AKIA|aws_secret_access_key"` rỗng.

Liệt kê object trong bucket local: `aws --endpoint-url http://localhost:9000 s3 ls s3://btl-cloud-documents/documents/ --recursive` (key `minioadmin` / `minioadmin-dev`).
