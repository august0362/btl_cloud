# MILESTONES — Kế hoạch, tiến độ và nghiệm thu

> Tài liệu 3/3 của Design Baseline v1.0: **CÔNG VIỆC, TIẾN ĐỘ, KIỂM CHỨNG, NGHIỆM THU**. Yêu cầu: [CONTEXT.md](CONTEXT.md). Thiết kế: [ARCHITECTURE.md](ARCHITECTURE.md).
>
> `BASELINE_VERSION: 1.0` · `OWNER_APPROVED_M0: NO` · **Chưa được phép triển khai backend/frontend** cho tới khi owner phê duyệt ở [OWNER DESIGN APPROVAL](#owner-design-approval).

**Mục lục:** [1 Quy tắc](#1-quy-tắc) · [2 Giao thức hoàn thành](#2-giao-thức-hoàn-thành-task) · [3 Làm song song](#3-làm-song-song-và-đồng-bộ) · [4 Tổng quan](#4-tổng-quan-và-lịch-đề-xuất) · [M0](#m0--requirements-architecture--uxui-design) · [Owner approval](#owner-design-approval) · [M1](#m1--backend-foundation) · [M2](#m2--backend-authentication--documents) · [M3](#m3--frontend-foundation--screens) · [M4](#m4--full-stack-integration--verification) · [M5](#m5--aws-deployment-preparation) · [Thay đổi baseline](#nhật-ký-thay-đổi-baseline) · [Lỗi tồn đọng](#lỗi-tồn-đọng) · [Final acceptance](#final-owner-acceptance)

---

## 1. Quy tắc

| Vai trò | Phạm vi | Được sửa trong tài liệu này |
|---|---|---|
| `CLAUDE_DESIGN` | M0; giữ `docs/` nhất quán | Task M0; Nhật ký thay đổi baseline |
| `CLAUDE_BACKEND` | `backend/`, `docker-compose.yml`, `docker/`, root `package.json`, `scripts/` | Task của mình |
| `CODEX_FRONTEND` | `frontend/` | Task của mình |
| `INTEGRATION` | Ghép nối, kiểm thử toàn hệ thống, `README.md`, kế hoạch AWS | Task của mình; mục Lỗi tồn đọng |
| `OWNER` | Chủ dự án (con người) | Task `OWNER`; OWNER DESIGN APPROVAL; FINAL OWNER ACCEPTANCE; duyệt thay đổi baseline |

Agent phụ trách ghi ở đầu mỗi milestone; task nào khác vai trò thì ghi `[OWNER]`/`[INTEGRATION]` ngay sau ID. Định dạng task:

```text
- [ ] **ID** Hành động chính xác
  - In: tài liệu / artifact cần có · Out: artifact phải tạo · Dep: task / gate · Verify: lệnh hoặc thao tác + kết quả mong đợi
  - Bằng chứng: —   (IN PROGRESS | IMPLEMENTED / NOT VERIFIED | BLOCKED: lý do | bằng chứng hoàn thành)
```

## 2. Giao thức hoàn thành task

1. Chỉ đổi `[ ]` → `[x]` cho **task của chính mình**, sau khi đã hoàn thành **và** kiểm chứng. Task đã tick phải có bằng chứng ngắn: file đã đổi, lệnh đã chạy + kết quả quan sát được (ví dụ "`npm --prefix backend run test:integration` → 42 passed, 0 failed"), commit hash nếu có, hạn chế còn lại.
2. Chỉ tạo file **không** chứng minh task đã xong. **Không bao giờ** ghi test pass khi chưa chạy.
3. Bị chặn → giữ `[ ]` + `BLOCKED: <lý do>`. Viết xong nhưng chưa test → giữ `[ ]` + `IMPLEMENTED / NOT VERIFIED`.
4. Không tick task của vai trò khác, không tick ô nào ở OWNER DESIGN APPROVAL / FINAL OWNER ACCEPTANCE.
5. Phát hiện §A7 hoặc thiết kế sai/thiếu → **không tự sửa lệch**; ghi đề xuất `PROPOSED` vào Nhật ký thay đổi baseline và chờ owner.

## 3. Làm song song và đồng bộ

- Mỗi agent dùng nhánh riêng (khuyến nghị worktree riêng): `feature/backend-*`, `feature/frontend-*`, `chore/integration-*`. Không push thẳng `main`; merge qua PR có CI `ci-required`.
- Chỉ sửa dòng checkbox và dòng "Bằng chứng" của task mình; không viết lại hay định dạng lại phần của người khác.
- Trước khi mở PR: `git fetch origin && git rebase origin/main`, giải quyết xung đột `docs/MILESTONES.md` **từng dòng**; **không bao giờ** thay cả file bằng bản cũ. Không có xung đột lockfile giữa FE và BE (D-16).
- Tài liệu này không phải cơ sở dữ liệu sửa đồng thời: cập nhật tiến độ theo lô, cùng PR với code của task.
- Gate chung (OWNER DESIGN APPROVAL, M4-G, M5-G, FINAL OWNER ACCEPTANCE) không bao giờ được agent tự duyệt.
- Frontend làm song song dựa trên §A7: test mock `fetch`/XHR đúng schema §A7.4; ghép thật ở M4.

## 4. Tổng quan và lịch đề xuất

Hạn học phần (CONTEXT §C6.2, cần xác nhận): nộp sản phẩm ~**09/11/2026**, bảo vệ ~**16/11/2026**.

| Milestone | Owner | Phụ thuộc | Mục tiêu (đề xuất) | Gate |
|---|---|---|---|---|
| M0 Design | CLAUDE_DESIGN | — | 20–21/10 | OWNER DESIGN APPROVAL |
| M1 Backend Foundation | CLAUDE_BACKEND | Gate M0, M1-00 | 22–24/10 | — |
| M2 Backend Auth & Documents | CLAUDE_BACKEND | M1 | 24–30/10 | — |
| M3 Frontend | CODEX_FRONTEND | Gate M0 | 22–30/10 (song song M1–M2) | — |
| M4 Integration & Verification | INTEGRATION (+ BE/FE sửa lỗi) | M2, M3 | 31/10–03/11 | M4-G |
| M5 AWS Preparation (chỉ kế hoạch) | INTEGRATION | M4 | 03–05/11 | M5-G |
| Triển khai AWS thật | — | M5-G | **Ngoài baseline**, cần owner cho phép riêng | — |

---

## M0 — Requirements, Architecture & UX/UI Design

Agent: `CLAUDE_DESIGN` · Gate: OWNER DESIGN APPROVAL · Nhánh: `chore/m0-design-baseline`

- [x] **M0-01** Kiểm tra repository và tài liệu nguồn
  - In: repo, tệp đề xuất trên máy owner · Out: CONTEXT §C0, §C6.5 · Dep: — · Verify: nguồn trích bằng đường dẫn thật, nội dung khớp bản gốc
  - Bằng chứng: Repo chỉ có `README.md`, `.github/` (1 commit `841adba`). Trích text bằng `pdftotext -enc UTF-8 -layout` (đề xuất + hướng dẫn) và Python `zipfile` (4 bản docx, so sánh bằng `diff`); xem 2 ảnh nhúng (sơ đồ kiến trúc, Pricing Calculator). Không có `BTL Cloud.docx` (DS-02). Môi trường: Node v24.19.0, npm 11.17.0, WSL2 Ubuntu 22.04, **chưa có Docker**.

- [x] **M0-02** Chốt yêu cầu và phạm vi
  - In: S1, S2, S5, S7 · Out: CONTEXT §C1–C7 · Dep: M0-01 · Verify: mỗi FR đủ 8 thuộc tính; NFR phân loại M/P; không bịa số liệu hiệu năng
  - Bằng chứng: `docs/CONTEXT.md`. Câu trả lời của owner (2026-10-20: AWS cá nhân; làm local trước; HTTPS/egress ở M5) phản ánh vào S7, AS-05, OD-05, OD-06, OD-14.

- [x] **M0-03** Xác định tác nhân và Use Case
  - In: CONTEXT §C3–C4 · Out: ma trận §C3.2; ARCHITECTURE §A2 (ngữ cảnh, use case, UC-01…UC-12) · Dep: M0-02 · Verify: mỗi FR ánh xạ ≥ 1 UC (§A11.1)
  - Bằng chứng: §A2.4: 12 UC đủ actor/FR, trigger, input, tiền điều kiện, luồng chính, lỗi, kết quả, API/Page.

- [x] **M0-04** Thiết kế kiến trúc và ranh giới module
  - In: stack ưu tiên · Out: ARCHITECTURE §A1, §A3 · Dep: M0-02 · Verify: không microservice/Redis/K8s; mỗi module có trách nhiệm, input/output, phụ thuộc, lỗi, owner
  - Bằng chứng: §A1 (stack, D-01…D-18, thư mục, quy tắc phụ thuộc), §A3 (container, module backend/frontend, class diagram, đặc tả module, SPA cùng origin, pipeline).

- [x] **M0-05** Thiết kế cơ sở dữ liệu và vòng đời storage
  - In: FR-04, 08, 09; BR-06…08 · Out: ARCHITECTURE §A4, §A6 · Dep: M0-04 · Verify: upload lỗi không tạo bản ghi; thay thế lỗi giữ tệp cũ; lỗi dọn dẹp phục hồi được
  - Bằng chứng: 4 bảng (bảng thứ 4 có lý do ở D-07), INV-D1…D3, INV-C1…C3; đã rà soát tranh chấp guard ↔ worker (điều kiện `attempts = 0`, §A6.8).

- [x] **M0-06** Xác định xác thực và bảo mật
  - In: yêu cầu phiên opaque + HttpOnly · Out: ARCHITECTURE §A5 · Dep: M0-04 · Verify: đủ đăng nhập/đăng xuất, thời hạn, thu hồi, cookie, CSRF, băm mật khẩu, quyền sở hữu, lỗi, cross-origin, HTTPS, hết phiên
  - Bằng chứng: §A5.1–A5.8; ranh giới bảo mật §A11.4.

- [x] **M0-07** Định nghĩa đầy đủ hợp đồng API
  - In: §A4–A6 · Out: ARCHITECTURE §A7 · Dep: M0-05, M0-06 · Verify: mỗi endpoint có mục đích, quyền, input, ví dụ, output, lỗi, thao tác DB/storage, trang dùng
  - Bằng chứng: §A7: quy ước, envelope, 17 mã lỗi server, schema, validate, API-01…API-14 (thêm API-02, có lý do D-14).

- [x] **M0-08** Thiết kế màn hình frontend
  - In: §A7 · Out: ARCHITECTURE §A8 · Dep: M0-07 · Verify: mỗi trang đủ trường; mỗi hành động UI có API hoặc giải thích trạng thái cục bộ
  - Bằng chứng: §A8: route, token, component, trạng thái theo auth, P-01…P-08 (bảng + cây component + wireframe), thông điệp, dialog, F-01…F-18. Thêm P-04 và bộ lọc loại tệp → OD-10.

- [x] **M0-09** Sơ đồ tuần tự, luồng lỗi và sơ đồ trực quan
  - In: §A4–A7 · Out: ARCHITECTURE §A9 (SEQ-01…09) và sơ đồ module · Dep: M0-07 · Verify: tên endpoint/bảng/cột khớp §A4, §A7; sơ đồ parse được
  - Bằng chứng: Theo yêu cầu owner (2026-10-20) đã thêm sơ đồ module (§A1.3, §A3.2.1–A3.2.4, §A3.3.1–A3.3.2, §A3.8, §A5.5, §A6.8, §A8.7, §A8.12). Kiểm tra bằng parser thật `mermaid@11.4.1` + `jsdom` (cài trong scratchpad, không phải dependency dự án), trước đó đã thử với tệp cố tình hỏng để xác nhận công cụ bắt lỗi. Kết quả cuối ghi ở M0-11.

- [x] **M0-10** Ánh xạ local/AWS
  - In: S2, S3, S7 · Out: ARCHITECTURE §A10 · Dep: M0-04 · Verify: không provisioning; không bịa giá; egress/NAT/endpoint/HTTPS/chi phí ghi là chưa giải quyết
  - Bằng chứng: §A10.1–A10.10 (U-01…U-08).

- [x] **M0-11** Kiểm tra chéo toàn bộ tài liệu
  - In: 3 tài liệu · Out: ARCHITECTURE §A11; sửa điểm không nhất quán · Dep: M0-03…M0-10 · Verify: script kiểm tra ID/anchor/tham chiếu mục + parser Mermaid
  - Bằng chứng: Lần chạy cuối sau khi rút gọn (2026-10-20). Script Python trong scratchpad (không commit) → **`PROBLEMS: 0`**: mọi ID tham chiếu đều đã định nghĩa (FR 9, AC 36, BR 11, NFR 31, OD 14, D 18, UC 12, API 14, P 8, SEQ 9, F 18, U 8, INV 6, task 76, ACC 15); 12 UC đủ trigger/input, tiền điều kiện, luồng chính, lỗi, kết quả; 14 endpoint đủ mục đích, input, ví dụ, thành công, lỗi, DB, frontend; 8 page đủ trường; 17 mã lỗi server đều có cách xử lý trên UI; **283 tham chiếu `§A…`/`§C…` đều trỏ tới mục có thật** (kiểm tra mới, vì đánh số lại khi rút gọn); anchor hợp lệ. Parser `mermaid@11.4.1`: `mermaid blocks: 40, failed: 0`. Rà soát thủ công đã sửa: §A5.5 tách 403 `CSRF_REJECTED` khỏi 403 `FORBIDDEN`; cú pháp `npm exec`; `DocumentService` nhận `InspectedFile` và gọi bảng task qua `CleanupService`; 5 UC thiếu "tiền điều kiện/kết quả" sau lần rút gọn đầu.

- [x] **M0-12** Chuẩn bị cho owner review
  - In: 3 tài liệu · Out: OWNER DESIGN APPROVAL; danh sách OD (CONTEXT §C6.6); báo cáo tóm tắt · Dep: M0-11 · Verify: không ô phê duyệt nào bị agent tick; `OWNER_APPROVED_M0: NO`
  - Bằng chứng: Theo yêu cầu owner, đã rút gọn 3 tài liệu (giữ nguyên sơ đồ, hợp đồng API, schema, đặc tả màn hình); bản trước được sao lưu trong scratchpad. Tài liệu nằm trên nhánh `chore/m0-design-baseline`, **chưa commit**. Không có tệp mã ứng dụng nào được tạo.

---

## OWNER DESIGN APPROVAL

Chỉ owner (con người) được tick và đổi `OWNER_APPROVED_M0` thành `YES`.

- [x] I have reviewed CONTEXT.md
- [x] I have reviewed ARCHITECTURE.md
- [x] I have reviewed the API contract
- [x] I have reviewed the UI/UX specification
- [x] I approve implementation based on baseline v1.0

OWNER_APPROVED_M0: YES

| OD (CONTEXT §C6.6) | Quyết định của owner | Ghi chú |
|---|---|---|
| OD-01 Stack · OD-13 Node 24 · OD-14 Docker Desktop | | |
| OD-02 50 MB = 52 428 800 byte · OD-03 404/403 · OD-04 tự đăng nhập | | |
| OD-10 Trang chi tiết + lọc loại tệp · OD-11 Ân hạn 120 s · OD-12 Phiên 7 ngày | | |

---

## M1 — Backend Foundation

Agent: `CLAUDE_BACKEND` (trừ M1-00) · Phụ thuộc chung: `OWNER_APPROVED_M0: YES`

> **Môi trường kiểm chứng của CLAUDE_BACKEND (2026-10-20):** máy chưa có Docker (M1-00), nên integration test và chạy thử đều dùng **MySQL 8.4.7 bản zip + SeaweedFS 4.48 bản Windows** (cùng phiên bản với image `mysql:8.4` và `chrislusf/seaweedfs:4.48` trong compose), chạy tạm trong scratchpad của phiên. DB được khởi tạo bằng đúng `docker/mysql/init/01-init.sql`; SeaweedFS dùng đúng `docker/seaweedfs/s3.json`. Riêng **file compose chưa được chạy** (M1-03). Không commit (owner yêu cầu).

- [ ] **M1-00** [OWNER] Cài Docker Desktop (backend WSL2)
  - In: AS-02, OD-14 · Out: Docker chạy được · Dep: — (làm ngay được) · Verify: `docker compose version` in phiên bản; `docker run --rm hello-world` thành công
  - Bằng chứng: —
- [x] **M1-01** Khởi tạo `backend/`: TS strict, ESLint, Vitest, khung `src/` theo §A1.3; script `dev`, `build`, `start`, `lint`, `test`, `test:integration`, `prisma:deploy`
  - In: §A1.1, §A1.3, §A1.4 · Out: `backend/package.json` + lockfile, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts` · Dep: Gate M0 · Verify: `npm --prefix backend run build`, `lint`, `test` thoát 0; ghi phiên bản đã ghim của Express, Prisma, AWS SDK
  - Bằng chứng: `backend/package.json` (phiên bản ghim chính xác: express 5.3.0, @prisma/client + prisma 6.19.3, @aws-sdk/client-s3 + lib-storage 3.1153.0, zod 3.25.76, multer 2.4.0, argon2 0.45.1, pino 9.14.0, typescript 5.9.3, vitest 3.2.7, eslint 10.13.0), `tsconfig.json` (strict + `noUncheckedIndexedAccess`), `tsconfig.build.json`, `eslint.config.js` (rule `no-restricted-imports` thực thi §A1.4), `vitest.config.ts` (project `unit` / `integration`). `npm run build` → exit 0; `npm run lint` (eslint + `tsc --noEmit`) → exit 0; `npm test` → 67 passed. Ghi chú: npm 11 chặn install script mặc định → `allowScripts` cho 5 gói (prisma, @prisma/client, @prisma/engines, esbuild, argon2) nằm trong package.json; thêm `postinstall: prisma generate` (CR-002). Không chọn Prisma 7/8, TypeScript 7, Vitest 5 vì là major mới/RC.
- [x] **M1-02** Root `package.json` (không dependency), `scripts/run-all.mjs`, `.gitignore` (`node_modules`, `dist`, `.env`, `tmp`)
  - In: D-16, `ci.yml` · Out: script root `postinstall`/`lint`/`build`/`test` · Dep: M1-01 · Verify: ở root `npm ci && npm run lint && npm run build && npm test` thành công khi chưa có `frontend/`
  - Bằng chứng: `package.json`, `package-lock.json` (root, rỗng), `scripts/run-all.mjs` (thêm tham số lọc package, ví dụ `node scripts/run-all.mjs test backend`), `.gitignore`. Kiểm trên **bản sao sạch** (chỉ root + `backend/`, không `node_modules`, không `frontend/`) trong scratchpad: `npm ci` (postinstall → backend `npm ci` + `prisma generate`) → exit 0; `npm run lint` → 0; `npm run build` → 0; `npm test` → 64/64 tại thời điểm chạy. Lần mô phỏng đầu **thất bại ở lint** vì Prisma client chưa được sinh trên bản cài sạch → sửa bằng `postinstall` rồi chạy lại đạt.
- [ ] **M1-03** `docker-compose.yml` + `docker/mysql/init/01-init.sql` theo §A10.1; ghim tag MinIO/mc còn tải được (RK-06)
  - In: §A10.1 · Out: compose `mysql`, `minio`, `minio-init` · Dep: M1-00 · Verify: `docker compose ps` → mysql, minio healthy, minio-init exit 0; 2 bucket tồn tại; GET ẩn danh một object → 403; có `btl_cloud_test`
  - Bằng chứng: **IMPLEMENTED / NOT VERIFIED — BLOCKED bởi M1-00 (chưa có Docker).** MinIO không còn dùng được: `dl.min.io` trả 410 Gone, `hub.docker.com/v2/repositories/minio/minio` trả 404 → theo lựa chọn của owner, compose dùng `mysql:8.4` (giữ nguyên service của Antigravity) + `chrislusf/seaweedfs:4.48` map cổng `9000:8333`, cấu hình S3 ở `docker/seaweedfs/s3.json`; bucket tạo bằng `npm --prefix backend run storage:init` thay cho `minio-init` (CR-001). Đã kiểm tương đương bằng bản binary cùng phiên bản: `01-init.sql` tạo `btl_cloud_test` (utf8mb4_0900_ai_ci); `storage:init` → "btl-cloud-documents: đã tạo", "btl-cloud-documents-test: đã tạo". Chạy thử thật phát hiện SeaweedFS mặc định chỉ 8 volume → bucket thứ hai báo "No writable volumes" → đã thêm `-volume.max=100 -master.volumeSizeLimitMB=1024` vào compose. Chưa kiểm healthcheck và GET ẩn danh.
- [x] **M1-04** `config/env.ts` (zod) + `.env.example` theo §A10.2
  - In: §A10.2, D-17 · Out: `Config` bất biến · Dep: M1-01 · Verify: unit test: thiếu `DATABASE_URL` → lỗi nêu tên biến; mặc định đúng bảng; parse boolean/number đúng
  - Bằng chứng: `src/config/env.ts`, `backend/.env.example`; `test/unit/config.test.ts` (4 test pass): thiếu `DATABASE_URL` → `ConfigError` nêu tên biến; mặc định khớp §A10.2; parse `COOKIE_SECURE`, `PORT`, `ALLOWED_ORIGINS`, `TRUST_PROXY=1`, `__Host-sid`; từ chối `COOKIE_SECURE=yes`, `PORT=abc`, `S3_ENDPOINT` sai. `backend/.env` cũ của Antigravity (tên biến lệch §A10.2) được sao lưu rồi thay bằng `.env.example`.
- [x] **M1-05** `schema.prisma` + migration `init` (4 bảng, PK, FK, UNIQUE, index, kiểu cột) theo §A4.3
  - In: §A4 · Out: `prisma/schema.prisma`, `prisma/migrations/<ts>_init/` · Dep: M1-03 · Verify: `prisma:deploy` trên DB trống; `SHOW CREATE TABLE` 4 bảng khớp §A4.3 (dán tóm tắt); collation `utf8mb4_0900_ai_ci`
  - Bằng chứng: Dùng lại phần database của **Antigravity** (owner cho phép): giữ migration `20261020100306_init` (đã sửa collation `utf8mb4_0900_ai_ci`, có chú thích), chỉ thêm `DEFAULT CURRENT_TIMESTAMP(3)` cho `updated_at` của 3 bảng theo §A4.3 (đối chiếu bằng `prisma migrate diff --from-empty`); schema thêm `@default(now())` tương ứng. `npm run prisma:deploy` trên `btl_cloud` trống → "All migrations have been successfully applied". Tóm tắt `SHOW CREATE TABLE documents`: `id char(36)` PK, `visibility enum('PUBLIC','PRIVATE') NOT NULL` không default, `size_bytes int unsigned`, `file_version int unsigned DEFAULT '1'`, `updated_at datetime(3) DEFAULT CURRENT_TIMESTAMP(3)`, UNIQUE `uq_documents_storage_key`, KEY `idx_documents_visibility_created`, `idx_documents_owner_created`, FK `documents_owner_id_fkey … ON DELETE RESTRICT`, `COLLATE=utf8mb4_0900_ai_ci`; 4 bảng ứng dụng đều InnoDB + `utf8mb4_0900_ai_ci`. Test `database-schema.test.ts` của Antigravity (20 test) nối vào hạ tầng chung và pass; trong lúc nối phát hiện 3 test FK của bản gốc **không bao giờ đúng** (Prisma trả cột `SHOW CREATE TABLE` tên `f0/f1`; test "không có FK" pass giả) → viết lại bằng `information_schema`.
- [x] **M1-06** `db/prisma.ts`; interface `ObjectStorage`; `S3ObjectStorage`; `InMemoryObjectStorage` có chèn lỗi
  - In: §A3.2.4, §A6.2 · Out: `src/storage/*`, `src/db/prisma.ts` · Dep: M1-03, M1-04 · Verify: integration với MinIO: put → get (so byte) → delete → delete lần 2 không lỗi → `checkHealth`; bucket sai → `StorageError UNAVAILABLE`
  - Bằng chứng: `src/db/prisma.ts` (factory thay singleton của Antigravity + `TransactionRunner` để service không phụ thuộc PrismaClient), `src/storage/{object-storage,s3-object-storage,in-memory-object-storage}.ts`. `test/integration/storage-adapter.test.ts` (3 test pass, trên SeaweedFS thay MinIO): put multipart 20 MB → get đúng SHA-256 và ContentLength → delete → delete lần 2 không lỗi → get `NOT_FOUND`; `checkHealth` OK; bucket sai → `UNAVAILABLE`; endpoint chết → `UNAVAILABLE` trong < 10 s. Ghi chú: SeaweedFS tự tạo bucket khi PutObject vào bucket chưa có (khác S3 thật) nên không kiểm put vào bucket sai.
- [x] **M1-07** `createApp` + middleware nền (requestId, logger redact, helmet/CSP, JSON 16 KB, cookie, `notFound`, `errorHandler`, `no-store`), timeout server §A10.4, graceful shutdown §A10.5
  - In: §A3.8, §A5.8, §A7.1–A7.3 · Out: `src/app.ts`, `src/server.ts`, `src/http/**` · Dep: M1-04 · Verify: Supertest: `/api/khong-co` → 404 `ROUTE_NOT_FOUND` có `details: []` và `requestId` = header; JSON hỏng → `INVALID_JSON`; 17 KB → `PAYLOAD_TOO_LARGE`; có CSP và nosniff
  - Bằng chứng: `src/app.ts`, `src/server.ts` (requestTimeout 900 s, keepAlive 125 s, headers 126 s; `prisma.$connect()` sớm), `src/lifecycle.ts`, `src/http/**`. `test/unit/app.test.ts`: 404 envelope + `requestId` = header + `Cache-Control: no-store`; `INVALID_JSON`; body 17 KB → `PAYLOAD_TOO_LARGE`; CSP (`default-src 'self'`, `frame-ancestors 'none'`), nosniff, `no-referrer`, HSTS chỉ khi bật, không `X-Powered-By`; lỗi lạ → 500 không lộ stack. `test/unit/lifecycle.test.ts` (3 pass): thứ tự worker → server → DB → storage → exit 0; tín hiệu lần hai không chạy lại; quá 30 s → exit 1. **Hạn chế:** việc OS chuyển SIGTERM/SIGINT tới handler không kiểm được trên Windows (Node trên Windows kết thúc tiến trình ngay) → cần kiểm lại trên Linux/EC2 (M5).
- [x] **M1-08** API-01 và API-02
  - In: §A7.7 · Out: `src/modules/health/*` · Dep: M1-06, M1-07 · Verify: API-01 đủ 4 trường, vẫn 200 khi DB sai cấu hình; API-02 → 503 với `details[].field = database` / `storage` khi thành phần lỗi
  - Bằng chứng: `src/modules/health/health.routes.ts`. Unit: API-01 đủ 4 trường, `$queryRaw` không được gọi; API-02 200 / 503 `database` / 503 `storage`. Chạy thử bản build thật phát hiện API-02 trả 503 ở **lần gọi đầu** (kết nối Prisma lười > 2 s) → thêm `prisma.$connect()` khi khởi động; sau khi sửa, lần gọi đầu trên cả 2 instance trả 200 `checks: {database: ok, storage: ok}`.
- [x] **M1-09** Phục vụ SPA khi `SERVE_FRONTEND=true` (§A3.7)
  - In: §A3.7 · Out: `src/http/static.ts` · Dep: M1-07 · Verify: với dist mẫu: `/` → index.html `no-cache`; `/assets/a.js` → `immutable`; `/me/documents` (Accept html) → index.html; `/api/khong-co` → JSON 404
  - Bằng chứng: `src/http/static.ts`; `test/unit/app.test.ts` › "Phục vụ SPA cùng origin": đủ 4 điều kiện trên + `SERVE_FRONTEND=false` chỉ phục vụ API. Chưa kiểm với `frontend/dist` thật (thuộc M4-02).
- [x] **M1-10** Hạ tầng test: tách unit/integration, `migrate reset` trên DB test, helper xoá dữ liệu, fixtures (PDF/DOCX/PPTX hợp lệ, `.txt` đổi đuôi, ZIP thường đổi đuôi `.docx`, 0 byte, tên tiếng Việt, tệp 52 428 800 và 52 428 801 byte sinh lúc chạy)
  - In: §A10.6 · Out: `vitest.config.ts`, `test/**` · Dep: M1-05 · Verify: `npm --prefix backend test` (không Docker) và `test:integration` (có compose) đều pass; ghi số test
  - Bằng chứng: `test/helpers/{config,fixtures,fault-storage,contract}.ts`, `test/integration/{global-setup,context}.ts`. Lần chạy cuối: `npm test` → **7 file, 67 passed**; `npm run test:integration` → **9 file, 86 passed** (~55 s, trên MySQL/SeaweedFS bản binary). Global setup chặn DB không có hậu tố `_test`. **Lưu ý:** Prisma 6.19 chặn `migrate reset` khi được gọi từ AI agent → owner đã đồng ý cho `btl_cloud_test` ("Đồng ý chạy migrate reset trên btl_cloud_test"); agent chạy lại sau này cần owner đồng ý lại (CR-003). Người chạy trực tiếp không bị chặn.
- [x] **M1-11** Kiểm tra tương thích CI; soạn đề xuất job integration test (OD-08) **dạng văn bản trong bằng chứng**, không sửa `.github/`
  - In: `ci.yml` · Out: kết quả lệnh tương đương CI + đề xuất · Dep: M1-02, M1-10 · Verify: root `npm ci && npm run lint && npm run build && npm test` thoát 0; nếu push `feature/**` thì ghi kết quả `ci-required`
  - Bằng chứng: Mô phỏng đúng các bước của `ci-required` trên bản sao sạch (xem M1-02) → 4 bước exit 0. Chưa push (owner yêu cầu không commit) nên chưa có kết quả GitHub Actions. **Đề xuất cho owner (OD-08)**, thêm job riêng vào `ci.yml`: `services: mysql (image mysql:8.4, env như compose, port 3306)` + `seaweedfs (chrislusf/seaweedfs:4.48, command server -s3 … -volume.max=100)` (hoặc chạy `docker compose up -d` trong step); các bước `npm ci` → `mysql -h127.0.0.1 -uroot -proot_dev_password < docker/mysql/init/01-init.sql` → `npm --prefix backend run test:integration`. Trong CI không có biến môi trường của Claude Code nên `migrate reset` không bị chặn.

---

## M2 — Backend Authentication & Documents

Agent: `CLAUDE_BACKEND` · Phụ thuộc chung: M1

- [x] **M2-01** `password.ts` (argon2id m=19456, t=2, p=1), token/hash phiên, `SessionRepository`, `UserRepository`
  - In: §A5.1, §A5.2 · Out: `modules/auth/*`, `modules/users/*` · Dep: M1-05 · Verify: hash có tiền tố `$argon2id$`; verify đúng/sai; token 43 ký tự base64url; hash 64 hex
  - Bằng chứng: `src/modules/auth/{password,session-token,session.repository}.ts`, `src/modules/users/*`. `auth.test.ts` › AC-01.6: hash lưu dạng `$argon2id$v=19$m=19456,p=1,t=2$…`, không chứa mật khẩu rõ; `sessions.id` = SHA-256 hex của token cookie; cookie khớp `/^sid=[A-Za-z0-9_-]{43};/`; đăng nhập sai mật khẩu → 401 (verify sai).
- [x] **M2-02** `csrfGuard` (§A5.4)
  - In: §A5.4 · Out: middleware · Dep: M1-07 · Verify: POST thiếu header → 403 `CSRF_REJECTED`; `Origin: http://evil.example` → 403; Origin hợp lệ → qua; không Origin + có header → qua; GET không bị ảnh hưởng
  - Bằng chứng: `src/http/middleware/auth.ts` › `csrfGuard`; `test/unit/app.test.ts` › "CSRF": đủ 5 điều kiện + header sai giá trị (`true`) → 403 + multipart bị từ chối trước khi đọc body vẫn trả JSON 403.
- [x] **M2-03** `sessionLoader`, `requireAuth`, helper cookie (§A5.3), xử lý hết phiên (§A5.7)
  - In: §A5.2, §A5.3, §A5.7 · Out: middleware · Dep: M2-01 · Verify: không cookie → `null`; cookie lạ → bị xoá; hết hạn → bản ghi + cookie bị xoá, route cần auth trả 401; thuộc tính `Set-Cookie` theo `COOKIE_SECURE`/`SESSION_COOKIE_NAME`
  - Bằng chứng: `src/http/middleware/auth.ts`, `src/modules/auth/session.cookie.ts`. `auth.test.ts`: cookie giả → `user: null` + `sid=; Max-Age=0`; phiên hết hạn → API-08 401, bản ghi bị xoá, cookie bị xoá; cookie đăng ký có `HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`, không `Secure` khi `COOKIE_SECURE=false`. Unit: Guest vào route cần auth → 401.
- [x] **M2-04** API-03, 04, 05, 06 + `authRateLimit`
  - In: §A7.7, §A5.6 · Out: `auth.routes/controller/service/schemas` · Dep: M2-02, M2-03 · Verify: AC-01.1–01.6 ở mức API: 201 + `HttpOnly`; trùng email khác hoa thường → 409; sai mật khẩu và email không có → body giống nhau (trừ `requestId`); sau logout cookie cũ → API-08 401, API-03 `user: null`; vượt giới hạn → 429 + `Retry-After`; trường lạ → `UNKNOWN_FIELD`
  - Bằng chứng: `src/modules/auth/*`. `auth.test.ts` (11 pass) phủ đủ các điều kiện trên, thêm: xoay phiên khi đăng nhập; phiên tạo ở instance A dùng được ở instance B và logout ở A vô hiệu ở B (2 app dùng chung DB). Unit: 429 `RATE_LIMITED` + `Retry-After` > 0; login chỉ đếm lần thất bại. Chạy thử 2 tiến trình thật (`:3000`/`:3001`): đăng xuất ở A → cookie cũ gọi B trả 401.
- [x] **M2-05** `document.policy.ts` + `document.loader.ts` (kiểm quyền trước khi đọc body)
  - In: §A5.5, CONTEXT §C3.2 · Out: policy + loader · Dep: M2-03 · Verify: unit test đủ ma trận {Guest, non-owner, owner} × {PUBLIC, PRIVATE} × {view, manage}; non-owner PUT `/file` tệp 10 MB → 403/404 và thư mục tạm **không** có tệp mới
  - Bằng chứng: `src/modules/documents/{document.policy,document.loader}.ts`; `test/unit/policy.test.ts` (10 ô ma trận pass); `documents-access.test.ts` › ma trận quản lý (thay/xoá: Public 403, Private 404, Guest 401) và "PUT 10 MB bởi non-owner": thư mục tạm không đổi, `fileVersion` không đổi; **quan sát thực tế: client thấy kết nối bị đóng sớm** (server trả 403 kèm `Connection: close` trước khi nhận hết body), đúng hành vi đã dự liệu ở §A7.7 API-12 (frontend xử lý `NETWORK_ERROR`).
- [x] **M2-06** `upload.middleware`, `file-inspector`, `storage-keys`, `content-disposition`
  - In: §A6.3 (U2), §A6.4, API-13 · Out: `modules/files/*` · Dep: M1-10 · Verify: 3 loại hợp lệ → đúng `fileType`/MIME; `.txt`→`.pdf` và ZIP→`.docx` → 415; 0 byte → `EMPTY_FILE`; 52 428 800 qua, +1 → 413; 2 tệp → `TOO_MANY_FILES`; "Đề cương Giải tích 1.pdf" giữ đúng tên; thư mục tạm rỗng sau mỗi case; `Content-Disposition` khớp ví dụ §A7.7
  - Bằng chứng: `src/modules/files/*`. `test/unit/files.test.ts` + `upload-middleware.test.ts` + `documents-upload.test.ts`: đủ mọi điều kiện trên (biên 52 428 800 / 52 428 801 chạy cả ở unit và qua HTTP thật), thêm DOCX đổi đuôi `.pptx` → 415, ZIP hỏng → 415, part văn bản > 16 KB → 413, part tệp tên lạ → `UNKNOWN_FIELD`. Unit test phát hiện lỗi `sanitizeFilename` đổi `.PDF` thành `.pdf` trong tên lưu → đã sửa (tên giữ nguyên, chỉ phần kiểm loại dùng chữ thường).
- [x] **M2-07** API-10 với giao thức guard; `CleanupService` (guard, `processTask`)
  - In: §A6.3, §A6.8 · Out: `documents.*`, `cleanup.service/repository` · Dep: M2-04, M2-05, M2-06, M1-06 · Verify: thành công → 201, có bản ghi + object, không còn task; storage lỗi (chèn lỗi) → 503, không bản ghi, không object; DB lỗi sau PutObject → 500, không bản ghi, object bị xoá; thiếu `visibility` → 400 (AC-05.2); guard đã bị claim → 500; `Location` đúng
  - Bằng chứng: `src/modules/documents/documents.service.ts` › `create`, `src/cleanup/*`. `documents-upload.test.ts` (14 pass) phủ đủ điều kiện trên; DB lỗi giả lập bằng cách xoá user ngay sau PutObject (FK fail → rollback → object bị bù trừ); guard bị claim → 500, sau đó worker xoá object; crash (guard + object, không bản ghi) → worker chỉ xoá khi guard đến hạn. Upload thật qua instance B, tải lại qua A: SHA-256 khớp.
- [x] **M2-08** API-07 và API-08 (lọc, sắp xếp, phân trang, escape `LIKE`)
  - In: §A7.6 · Out: `searchPublic`, `listMine` · Dep: M2-07 · Verify: Private không bao giờ có ở API-07; API-08 chỉ của mình; `q=%` theo nghĩa đen; "giai tich" thấy "Giải tích"; **ghi lại** kết quả "dai so" vs "Đại số" (RK-08); `totalPages` đúng; trang vượt → `items: []`; tham số sai → 400
  - Bằng chứng: `src/modules/documents/document.repository.ts` › `search` (SQL có `ESCAPE '!'`). `documents-search.test.ts` (8 pass) đủ điều kiện trên, thêm `_` và `!` theo nghĩa đen, owner tìm qua API-07 cũng không thấy Private của mình (BR-11). **RK-08: tìm "dai so" CÓ khớp "Đại số"** với `utf8mb4_0900_ai_ci` trên MySQL 8.4.7 → rủi ro RK-08 không xảy ra.
- [x] **M2-09** API-09 và API-13 (stream)
  - In: §A6.5, §A7.7 · Out: `getForViewer`, `openDownload` · Dep: M2-07 · Verify: Guest xem Public → `isOwner: false`; Private người khác → 404; Guest tải → 401; owner tải Private → SHA-256 trùng (AC-03.3); đủ header; storage dừng → 503 JSON; object mất → 503 + log `download.object_missing`
  - Bằng chứng: `documents-access.test.ts` (API-09/API-13): đủ điều kiện trên; header đúng nguyên văn (`Content-Disposition: attachment; filename="rieng.pdf"; filename*=UTF-8''rieng.pdf`, `private, no-store`, nosniff, `Content-Length`); tên tiếng Việt mã hoá `filename*` đúng ví dụ §A7.7. Chạy thử thật: tải qua instance khác, SHA-256 khớp; Guest → 401.
- [x] **M2-10** API-11 (metadata, chế độ hiển thị)
  - In: §A7.7 · Out: `updateMetadata` · Dep: M2-05 · Verify: sửa một phần; `description: null` xoá mô tả; `{}` → `NO_CHANGES`; `title: null` → `INVALID_TYPE`; non-owner Public 403 / Private 404; đổi sang PRIVATE → biến mất khỏi API-07 ngay; `fileVersion` không đổi
  - Bằng chứng: `documents-access.test.ts` (API-11): đủ điều kiện trên + thiếu CSRF → 403, Guest → 401, `storage_key` không đổi. Hành vi ghi nhận: body chỉ có trường lạ → trả cả `UNKNOWN_FIELD` và `NO_CHANGES`; có trường hợp lệ + trường lạ → chỉ `UNKNOWN_FIELD`.
- [x] **M2-11** API-12 (thay tệp an toàn)
  - In: §A6.6 · Out: `replaceFile` · Dep: M2-07, M2-09 · Verify: key mới ≠ key cũ, `fileVersion` + 1, visibility/title/description không đổi, có task `REPLACED` cho key cũ (≈ now + grace); storage lỗi → 503 và API-13 trả **byte cũ** (AC-08.2); xung đột giả lập → 409 và object mới bị xoá; bị xoá đồng thời → 404; part khác `file` → 400
  - Bằng chứng: `documents-replace-delete.test.ts` (API-12, 8 test): đủ điều kiện trên + đổi PDF → DOCX, Private giữ Private, grace 120 s → worker chưa xoá object cũ, grace 0 → worker xoá object cũ và giữ object mới (AC-08.3), xoá object cũ thất bại → vẫn 200, task có backoff, lần sau xoá được.
- [x] **M2-12** API-14 (xoá, gồm lỗi một phần)
  - In: §A6.7 · Out: `delete` · Dep: M2-07 · Verify: thành công → 204, mất bản ghi, mất object, không còn task; DeleteObject lỗi → vẫn 204, task còn `attempts = 1` và `next_attempt_at` ở tương lai; non-owner → 403/404; xung đột thử lại 1 lần rồi 409
  - Bằng chứng: `documents-replace-delete.test.ts` (API-14, 3 test) + ma trận quyền ở `documents-access.test.ts`: đủ điều kiện trên; lỗi một phần → tài liệu đã biến mất khỏi API-07, worker thử lại xoá được object. Nhánh thử lại: `DocumentService.delete` với bản chụp cũ (thay tệp xen giữa) → lần 2 thành công, xoá đúng key hiện hành. **Chưa kiểm** nhánh xung đột ở cả 2 lần → 409 (khó tạo xen kẽ đúng thời điểm); logic có trong code.
- [x] **M2-13** `CleanupWorker` (task đến hạn, phiên hết hạn, tệp tạm), backoff, kiểm tra an toàn
  - In: §A6.8 · Out: `cleanup.worker.ts`, `tmp-sweeper.ts`, start/stop trong `server.ts` · Dep: M2-07 · Verify: chỉ xử lý task đến hạn; backoff 1, 2, 4… ≤ 60 phút; key còn được tham chiếu → không xoá object; 2 `processTask` đồng thời → chỉ 1 claim; dừng khi SIGTERM; phiên hết hạn và tệp tạm > 60 phút bị xoá
  - Bằng chứng: `src/cleanup/*`. `cleanup.test.ts` (5 pass): chỉ task đến hạn; 2 lời gọi đồng thời → `['done', 'not_claimed']`; key còn tham chiếu → `skipped_referenced`, object còn; backoff đo được 1/2/4 phút; `tick()` xoá phiên hết hạn (giữ phiên còn hạn) và chỉ xoá tệp tạm > 60 phút; `start()`/`stop()` dừng êm. Unit: `backoffMs` = 1, 2, 4, 32, 60, 60 phút. SIGTERM: logic tắt êm (gọi `worker.stop`) kiểm ở `lifecycle.test.ts`; việc OS gửi tín hiệu chưa kiểm trên Windows (xem M1-07). 2 instance thật chạy worker song song không có lỗi.
- [x] **M2-14** Log: trường requestId, method, path, status, durationMs, userId, instanceId; sự kiện `cleanup.*`, `download.object_missing`; redact
  - In: §A5.8, NFR-OBS-02 · Out: cấu hình logger · Dep: M2-04 · Verify: log khi đăng nhập/upload không chứa mật khẩu, cookie, `Set-Cookie`
  - Bằng chứng: `src/lib/logger.ts`, `src/http/middleware/request-context.ts`. `contract.test.ts`: log JSON của request có `requestId`, `req.method`, `req.url`, `res.statusCode`, `durationMs`, `userId`, `instanceId`; toàn bộ log của vòng đời (đăng ký, đăng nhập, upload, …) không chứa mật khẩu và không chứa giá trị token 43 ký tự. Rà soát lại phát hiện pino-http ghi `responseTime` thay vì `durationMs` → đã đổi tên khoá cho khớp task.
- [x] **M2-15** Contract test API-01…API-14 (đủ trường và đúng kiểu DTO, envelope lỗi có `details` mảng và `requestId`)
  - In: §A7.2–A7.7 · Out: `test/integration/contract.*.test.ts` · Dep: M2-04…M2-12 · Verify: `test:integration` pass, liệt kê 14 endpoint; sai lệch với §A7 ghi vào Nhật ký thay đổi baseline, không sửa lệch hợp đồng
  - Bằng chứng: `test/integration/contract.test.ts` (2 pass) đi hết vòng đời và kiểm **14/14 endpoint** bằng schema `.strict()` (`test/helpers/contract.ts`); mọi test lỗi dùng `expectError` kiểm envelope + `requestId` = header. Không có sai lệch hợp đồng cần sửa §A7. Ma trận bên dưới.

**Ma trận tuân thủ hợp đồng — CLAUDE_BACKEND (2026-10-20)**

| Endpoint | Đã làm | Đã test | Khớp §A7 | Ghi chú / còn lại |
|---|---|---|---|---|
| API-01 `GET /api/health` | ✅ | ✅ unit + chạy thật | ✅ | Không chạm DB/storage |
| API-02 `GET /api/health/ready` | ✅ | ✅ unit + integration + chạy thật | ✅ | Đã sửa lỗi 503 ở lần gọi đầu |
| API-03 `GET /api/auth/me` | ✅ | ✅ | ✅ | Không bao giờ 401 |
| API-04 `POST /api/auth/register` | ✅ | ✅ | ✅ | Thứ tự `details`: lỗi trường trước, `UNKNOWN_FIELD` sau (hợp đồng không quy định thứ tự) |
| API-05 `POST /api/auth/login` | ✅ | ✅ | ✅ | Rate limit theo instance (RK-10) |
| API-06 `POST /api/auth/logout` | ✅ | ✅ | ✅ | Thu hồi có hiệu lực ở mọi instance |
| API-07 `GET /api/documents` | ✅ | ✅ | ✅ | RK-08 không xảy ra |
| API-08 `GET /api/documents/mine` | ✅ | ✅ | ✅ | |
| API-09 `GET /api/documents/{id}` | ✅ | ✅ | ✅ | |
| API-10 `POST /api/documents` | ✅ | ✅ | ✅ | |
| API-11 `PATCH /api/documents/{id}` | ✅ | ✅ | ✅ | Chỉ trường lạ → thêm `NO_CHANGES` |
| API-12 `PUT /api/documents/{id}/file` | ✅ | ✅ | ✅ | Từ chối sớm với body lớn → client thấy kết nối đóng (đã dự liệu ở §A7.7) |
| API-13 `GET /api/documents/{id}/download` | ✅ | ✅ | ✅ | `HEAD` do Express xử lý bằng handler GET, chưa test |
| API-14 `DELETE /api/documents/{id}` | ✅ | ✅ | ✅ | Nhánh 409 sau 2 lần xung đột chưa test |

**Lệnh khởi động local đã chạy thật (CLAUDE_BACKEND):** `npm --prefix backend run prisma:deploy` → `npm --prefix backend run storage:init` → `npm --prefix backend run build` → `PORT=3000 INSTANCE_ID=local-a node --env-file-if-exists=.env dist/server.js` (+ instance `:3001`). Khi có Docker: `docker compose up -d` thay cho MySQL/SeaweedFS bản binary.

---

## M3 — Frontend Foundation & Screens

Agent: `CODEX_FRONTEND` · Phụ thuộc chung: `OWNER_APPROVED_M0: YES` (không phụ thuộc backend; mock theo §A7)

- [ ] **M3-01** Khởi tạo `frontend/` (Vite + React + TS strict, ESLint, Vitest + RTL + jsdom, proxy §A10.3, script `dev`/`build`/`lint`/`test`/`test:e2e`)
  - In: §A1.1, §A1.3, §A10.3 · Out: khung dự án + lockfile riêng · Dep: Gate M0 · Verify: `build`, `lint`, `test` thoát 0; `npm run build` ở root build được cả hai
  - Bằng chứng: IMPLEMENTED / NOT VERIFIED (chỉ còn kiểm tra từ root; 2026-10-20). Owner phê duyệt trực tiếp trong chat: "Phê duyệt baseline v1.0, triển khai M3"; không tự đổi OWNER DESIGN APPROVAL. Nhánh `feature/frontend-m3`; commit frontend `8b0792f` (60 tệp) trong worktree `C:\Users\admin\.codex\worktrees\btl-cloud-frontend-m3-20261020`; 60 tệp đã được so SHA-256 với mã frontend đã kiểm thử ở workspace gốc. Workspace chung đã được tiến trình backend chuyển sang feature/database-m1 nên không đổi nhánh chung trở lại; vẫn giữ nguyên các tệp gốc. Triển khai tại frontend/ theo §A1.3. Ghim React/React DOM 19.3.1, react-router 7.18.4, Vite 8.3.4, TypeScript 5.9.3 (tương thích typescript-eslint), Vitest 5.0.5, Playwright 1.64.1; lockfile riêng. `npm --prefix frontend ci` → exit 0, 240 packages, audit 0 vulnerabilities; `typecheck`, `lint`, `build`, `test` trong frontend đều exit 0 (63 test). Build ra frontend/dist; proxy :5173 → :3000, strictPort, không biến môi trường frontend. Root package.json chưa có (M1-02 chưa sẵn sàng), nên chưa thể xác minh root build cả FE/BE và giữ checkbox này chưa tick. Backend/compose vừa xuất hiện trong workspace nhưng chưa có server.ts hoặc module auth/documents; GET :3000/api/health timeout 3 giây. Không sửa backend, root tooling hoặc .github/.
- [x] **M3-02** Token, global CSS, `AppLayout`/`AppHeader`/`AppFooter`/`SkipLink`, đủ 8 route §A8.2, P-08, `document.title`, focus `h1` khi đổi route
  - In: §A8.2–A8.4, §A3.3.1 · Out: `styles/*`, `App.tsx`, layout · Dep: M3-01 · Verify: mỗi route render đúng trang; `/khong-ton-tai` → P-08; `<html lang="vi">`
  - Bằng chứng: `frontend/src/App.tsx`, components/AppLayout.tsx + AppLayout.module.css, styles/tokens.css + global.css, hooks/usePageTitle.ts; đủ 8 route và title, lang=vi, header theo phiên, skip link, focus h1 cả sau khi RequireAuth nạp phiên. Build/lint/63 test pass; browser UI (API mock) kiểm cả 8 route ở 360/768/1280 px và menu mobile, không cuộn ngang.
  - Cập nhật theo yêu cầu owner trong chat (2026-10-20): sau khi chụp bản xem trước và owner yêu cầu bộ chọn trên web đang chạy, tích hợp `ThemeProvider`, `ThemePicker` và `src/theme/themes.css`. Có 19 bảng màu từ 22 PNG tham chiếu (gộp màu trùng và cặp sáng/tối), chọn bảng màu độc lập với Sáng/Tối/Theo hệ thống; phản quang nhẹ, nút trên header desktop/mobile, lưu riêng cấu hình giao diện vào localStorage và khôi phục trước khi render. Không lưu phiên/token, không sửa backend/API. Đã kiểm tra trực tiếp tại http://localhost:5173/login, không chèn CSS hay mock dữ liệu để chụp; ảnh tại `C:\Users\admin\.codex\artifacts\btl-cloud-theme-live-20261020`.
- [x] **M3-03** Component dùng chung §A8.5
  - In: §A8.5, §A8.11 · Out: `components/*` · Dep: M3-02 · Verify: `TextField` có `aria-invalid`/`aria-describedby` khi lỗi; `VisibilityPicker` mặc định không chọn; `ConfirmDialog` focus "Huỷ" khi danger, Esc → `onCancel`; `FileDropzone` dùng được bằng bàn phím; `Pagination` có `aria-current`
  - Bằng chứng: frontend/src/components/{ui,VisibilityPicker,FileDropzone,Pagination,SearchBar,documents,ToastProvider}.tsx. Form có label/lỗi liên kết, radio không chọn sẵn, dialog focus Huỷ + vòng Tab/Shift+Tab + Esc + trả focus, phân trang aria-current. Component test và browser UI bàn phím pass; axe kiểm cả 8 route × 3 viewport → 0 vi phạm WCAG A/AA được phát hiện (không phải chứng nhận accessibility).
- [x] **M3-04** API client: `types.ts` (khớp §A7.4), `client.ts`, `upload.ts`, `auth.ts`, `documents.ts`, `errors.ts`
  - In: §A7, §A3.3.2, §A8.12 · Out: `src/api/*` · Dep: M3-01 · Verify: `X-CSRF-Protection: 1` **chỉ** với POST/PUT/PATCH/DELETE; mở `data`; `ApiError` đủ trường; `NETWORK_ERROR`; `ABORTED`; tiến độ; `auth:unauthorized` khi 401 `UNAUTHENTICATED` nhưng **không** khi `INVALID_CREDENTIALS`; bỏ query rỗng; `downloadUrl(id)` đúng
  - Bằng chứng: frontend/src/api/ đủ types/client/upload/auth/documents/errors theo §A7. GET dùng credentials same-origin; CSRF đúng phương thức; mở data/204, giữ details/requestId; lỗi mạng/huỷ; event 401 phân biệt INVALID_CREDENTIALS. client.test.ts và upload.test.ts kiểm endpoint/query, PATCH tối thiểu, thứ tự multipart, chỉ part file khi thay, không tự đặt boundary, tiến độ/abort và lỗi 413/415/409/503; nằm trong 63 test pass. Đây là contract-shaped mock test, chưa là tích hợp backend thật.
- [x] **M3-05** `AuthProvider`, `RequireAuth`, `GuestOnly`, `safeRedirect`, `useDownload`
  - In: §A8.5, §A8.6 · Out: `auth/*`, `lib/safeRedirect.ts`, hook · Dep: M3-04 · Verify: `loading` → spinner; Guest vào route bảo vệ → `/login?redirect=…`; User vào `/login` → P-05; `safeRedirect` từ chối `//evil.com`, `https://evil.com`, `/\evil`; hết phiên → toast + chuyển trang; `useDownload` gọi API-03 rồi điều hướng
  - Bằng chứng: frontend/src/auth/*, lib/safeRedirect.ts, hooks/useDownload.ts. Nạp phiên, route guards, 401, logout và redirect có test. Đã sửa race giữa state phiên và React Router bằng cập nhật cùng transition; test đăng nhập trở lại /upload và đăng xuất về / pass ở RTL + Chrome. Download kiểm API-03 trước rồi dùng anchor tới API-13; không lưu token vào local/sessionStorage. Hạn chế download race theo API-13 vẫn như baseline; byte/cookie server thật chờ M4.
- [x] **M3-06** P-02 Đăng nhập, P-03 Đăng ký
  - In: §A8.7, §A8.8, §A8.9 · Out: `LoginPage`, `RegisterPage` · Dep: M3-03, M3-05 · Verify: thông điệp đúng §A8.8; `INVALID_CREDENTIALS` → Alert; `EMAIL_ALREADY_EXISTS` → trường Email; điều hướng đúng; giữ `redirect`
  - Bằng chứng: frontend/src/pages/AuthPages.tsx; validate blur/submit và sau lỗi; mật khẩu không trim, email chuẩn hoá, confirmPassword chỉ client; khoá gửi trùng; lỗi trùng email tại trường, sai đăng nhập xoá/focus mật khẩu. App.test.tsx kiểm đăng ký, login, session, lỗi và redirect; 63 test pass, browser UI có mobile/form focus/CSP.
- [x] **M3-07** P-01 Khám phá
  - In: §A8.7 · Out: `HomePage`, `SearchBar`, `DocumentCard` · Dep: M3-03, M3-05 · Verify: đồng bộ URL; Guest/User thấy đúng nút tải; 2 biến thể rỗng; lỗi → "Thử lại"; `page=abc` → 1 trước khi gọi API
  - Bằng chứng: frontend/src/pages/DocumentListPages.tsx, hooks/useDocumentFilters.ts, SearchBar/DocumentCard/Pagination; query lấy từ URL, tham số sai được chuẩn hoá trước API, pageSize 12; loading/2 empty states/error+retry và nút tải theo phiên. Test tìm kiếm, page=abc, query encoding, phân trang và reset bộ lọc pass; browser kiểm public Guest ở 3 viewport.
- [x] **M3-08** P-04 Chi tiết + luồng tải xuống
  - In: §A8.7 · Out: `DocumentDetailPage` · Dep: M3-07 · Verify: owner thấy Chỉnh sửa/Xoá/nhãn chế độ, non-owner không thấy; 404 → trạng thái không tìm thấy; xoá qua CD-01 → P-05
  - Bằng chứng: frontend/src/pages/DocumentDetailPage.tsx + hooks/useDownload.ts/useDeleteDocument.ts. Metadata, mô tả xuống dòng, action theo isOwner, 404, retry; CD-01 trước API-14, lỗi không xoá UI. RTL kiểm 404, non-owner, preflight phiên download, cancel/delete failure/conflict; Chrome kiểm focus/Esc và đủ route; đều pass với API mock.
- [x] **M3-09** P-05 Tài liệu của tôi
  - In: §A8.7 · Out: `MyDocumentsPage`, `MyDocumentList` · Dep: M3-07 · Verify: lọc `visibility` trên URL; CD-01 "Huỷ" → không gọi API; xác nhận → API-14 → gọi lại API-08, lùi trang khi rỗng; 2 biến thể rỗng
  - Bằng chứng: DocumentListPages.tsx/MyDocumentList; bộ lọc URL gồm visibility, bảng desktop/thẻ mobile; rỗng chưa có tài liệu hoặc rỗng do lọc; xoá chỉ sau server xác nhận, lùi trang khi xoá hàng cuối. RTL kiểm API mine/filter/page, huỷ xoá không gửi request, xoá cuối trang gọi lại page trước; browser responsive/axe pass. Tách dữ liệu A/B phía server chờ M4.
- [x] **M3-10** P-06 Tải lên
  - In: §A8.7 · Out: `UploadPage` · Dep: M3-03, M3-04 · Verify: không radio nào chọn sẵn (AC-05.1); tự điền tiêu đề; chặn sai đuôi / 0 byte / quá lớn; nút gửi chỉ bật khi hợp lệ; thứ tự part đúng; có tiến độ; huỷ → `abort`; map lỗi 413/415/503
  - Bằng chứng: UploadPage.tsx, hooks/useUploadTask.ts, lib/validation.ts/constants.ts; PDF/DOCX/PPTX, 1…52_428_800 byte, visibility không mặc định, tự điền tiêu đề, tiến độ XHR, abort/unmount/beforeunload, khoá gửi trùng. Chờ server kể cả progress=100%; lỗi giữ form/tệp, không toast thành công. RTL/XHR kiểm biên chính xác, 0 byte/sai đuôi, visibility, duplicate, abort, 413/415/503; Chrome upload chỉ bằng bàn phím và lỗi XHR pass với mock. Xác minh nội dung tệp thực do backend, chờ M4.
- [x] **M3-11** P-07 Chỉnh sửa / thay thế / xoá
  - In: §A8.7, §A8.10 · Out: `EditDocumentPage` · Dep: M3-08, M3-10 · Verify: chỉ gửi trường đã đổi; nút Lưu khoá khi chưa đổi; CD-03 khi Riêng tư → Công khai; thay qua CD-02 có tiến độ, cập nhật `fileVersion`; `CONFLICT` → Alert + "Tải lại"; `isOwner = false` → không có quyền; xoá → P-05
  - Bằng chứng: frontend/src/pages/EditDocumentPage.tsx; PATCH chỉ trường thay đổi, description rỗng → null, CD-03 khi Private→Public; CD-02 + tiến độ/huỷ cho thay file, chỉ gửi part file, cập nhật DTO khi thành công; CD-01 xoá; 409 có Tải lại kể cả trong dialog xoá. RTL kiểm metadata tối thiểu, cancel/confirm visibility, thay thành công/503/409 giữ version cũ, radio không tự đổi, delete failure/conflict, non-owner; Chrome lỗi upload/thay + keyboard/dialog pass. BR-07 ở DB/storage thực chờ M4.
- [x] **M3-12** Rà soát responsive và accessibility
  - In: §A8.11 · Out: sửa lỗi + checklist trong bằng chứng · Dep: M3-06…M3-11 · Verify: 360/768/1280 px không cuộn ngang; luồng upload chỉ dùng bàn phím; kiểm tương phản bằng công cụ; `axe` nếu khả thi
  - Bằng chứng: `npm --prefix frontend run test:ui` → 7 passed, 0 failed/skipped/flaky (32,6 s ở lượt cuối), Chrome headless trên production build + route mock đúng schema; playwright.ui.config.ts/ui-tests/. Kiểm 8 route × 360/768/1280 px: không cuộn ngang, axe WCAG 2 A/AA + 2.1 AA (gồm contrast) → 0 vi phạm được phát hiện; đã xem screenshot mobile/desktop tại frontend/test-results/collection-*.png. Upload bằng Tab/Enter/Space, CD-01 focus Huỷ, vòng Tab/Shift+Tab, Esc và trả focus, menu mobile/form error đều pass. Test chạy với CSP §A5.8. Đã sửa focus h1 sau nạp phiên và bổ sung vòng Tab dialog từ lỗi browser phát hiện. Đây là kiểm thử frontend mock, không tính là E2E full-stack; owner vẫn nghiệm thu thủ công theo ACC-12.
  - Kiểm tra sau khi tích hợp theme (2026-10-20): build/typecheck, lint và 63 unit/component test pass; 7 browser test cũ pass trên giao diện mới. `npm --prefix frontend run test:ui -- ui-tests/theme.spec.ts` bổ sung 4 browser test pass: đổi bảng màu/chế độ độc lập, reload/đổi route vẫn giữ lựa chọn, tự theo hệ thống, Esc/trả focus, storage hỏng/bị chặn, bộ chọn mobile 360 px cho 19 bảng màu × 2 chế độ và cả 8 route ở chế độ tối. Axe WCAG A/AA không phát hiện vi phạm trong các trường hợp này. Kiểm thử dùng API mock cho nội dung trang; theme đã được thử riêng trên dev server thật dù backend chưa chạy.
- [x] **M3-13** Playwright E2E spec FR-01…FR-09 trong `frontend/e2e/` (`baseURL` `http://localhost:3000`)
  - In: CONTEXT §C4, §A8 · Out: `e2e/*.spec.ts`, `playwright.config.ts` · Dep: M3-06…M3-11 · Verify: `npx playwright test --list` liệt kê spec cho từng FR (chạy thật ở M4-04)
  - Bằng chứng: frontend/playwright.config.ts + e2e/{fixtures.ts,workflows.spec.ts}; baseURL http://localhost:3000, không mock backend trong e2e/. `npm --prefix frontend run test:e2e -- --list` → exit 0, 6 spec: E2E-01 FR-01/04/05/06 (+reload phiên/HttpOnly); E2E-02 FR-02/03 (Guest→login→download/SHA-256/tên UTF-8); E2E-03 FR-02/03/06 (Guest/A/B); E2E-04 FR-07/08 (sửa/chế độ/thay/checksum); E2E-05 FR-09 (huỷ/xoá/404); E2E-06 FR-04/05/08 (nội dung giả/không báo thành công/giữ tệp cũ). Chưa thực thi 6 spec với backend thật: chưa có auth/documents/server, health :3000 timeout; giữ M4 chưa xác minh. Chạy local frontend: `npm --prefix frontend ci`, `npm --prefix frontend run dev` → http://localhost:5173 (API thật cần backend :3000); E2E thật cần build + SERVE_FRONTEND=true và MySQL/MinIO theo §A10.5; cài browser bằng `npm --prefix frontend exec -- playwright install chromium` trước khi chạy test:e2e. Test UI độc lập: build rồi test:ui, cần Google Chrome; report dưới test-results/ (gitignored).

---

## M4 — Full-Stack Integration & Verification

Agent: `INTEGRATION` (BE/FE sửa lỗi trong phạm vi của mình) · Phụ thuộc chung: M2, M3

- [ ] **M4-01** Ghép M1–M3 trên `chore/integration-m4` (từ `main` mới nhất), chạy full stack dev (§A10.5)
  - In: §A10.5 · Out: stack chạy ở `:5173` + `:3000` · Dep: M2-15, M3-13 · Verify: trên trình duyệt: đăng ký → tải lên → thấy ở P-05 → tìm thấy ở P-01
  - Bằng chứng: —
- [ ] **M4-02** Chế độ production-like cùng origin ở `:3000`
  - In: §A3.7 · Out: SPA do backend phục vụ · Dep: M4-01 · Verify: tải lại `/me/documents` vẫn ra SPA; asset `immutable`; đăng nhập/tải lên chạy được; request ghi có `X-CSRF-Protection`
  - Bằng chứng: —
- [ ] **M4-03** Kiểm tra tương thích API: chạy M2-15 + M3-04; thử từng dòng F-01…F-18 trên backend thật
  - In: §A7, §A8.12 · Out: bảng kết quả F-01…F-18 · Dep: M4-02 · Verify: 18/18 khớp hoặc đã có bug ID
  - Bằng chứng: —
- [ ] **M4-04** Chạy E2E (M3-13) FR-01…FR-09 ở `:3000`, ánh xạ theo AC
  - In: CONTEXT §C4 · Out: kết quả theo AC · Dep: M4-02 · Verify: `npm --prefix frontend run test:e2e` → số pass/fail; AC không tự động hoá được thì kiểm thủ công và ghi rõ
  - Bằng chứng: —
- [ ] **M4-05** Script ma trận phân quyền (Guest, User A, User B) gọi API trực tiếp, phủ mọi ô CONTEXT §C3.2
  - In: §C3.2, §A5.5 · Out: script/kịch bản `curl` + bảng kết quả · Dep: M4-02 · Verify: mọi ô đúng mã HTTP
  - Bằng chứng: —
- [ ] **M4-06** Upload/download: 3 định dạng, biên 52 428 800 / +1, tệp giả, tệp rỗng, tên tiếng Việt, SHA-256
  - In: FR-03, FR-04, §A6.4 · Out: bảng kết quả · Dep: M4-02 · Verify: đúng mã lỗi §A7.3; checksum khớp
  - Bằng chứng: —
- [ ] **M4-07** Lỗi storage: `docker compose stop minio` khi (a) tải lên → 503, không tài liệu "ma"; (b) thay → 503, `start minio` xong vẫn tải được tệp cũ; (c) xoá → 204, `start minio` + chờ worker → object mất; (d) dừng backend giữa upload với `UPLOAD_GUARD_MINUTES=1` → worker xoá object mồ côi
  - In: §A6.9, SEQ-03/08/09 · Out: bảng kết quả + `mc ls` · Dep: M4-02 · Verify: hành vi khớp §A6.9
  - Bằng chứng: —
- [ ] **M4-08** Nhiều instance: backend `:3000` và `:3001` dùng chung MySQL/MinIO
  - In: NFR-SCL-01, §A10.9 · Out: kết quả · Dep: M4-02 · Verify: đăng nhập ở `:3000` dùng được ở `:3001`; đăng xuất ở `:3001` vô hiệu ở `:3000`; tải lên ở một bên, tải xuống ở bên kia; 2 worker không xử lý trùng gây lỗi; API-01 trả `instanceId` khác nhau
  - Bằng chứng: —
- [ ] **M4-09** Chạy toàn bộ kiểm tra tự động: root CI, backend integration, frontend test, E2E
  - In: §A10.6 · Out: bảng lệnh → kết quả · Dep: M4-03…M4-08 · Verify: tất cả thoát 0 hoặc lỗi đã có bug ID
  - Bằng chứng: —
- [ ] **M4-10** Cập nhật mục Lỗi tồn đọng (mức độ + người phụ trách)
  - In: M4-03…M4-09 · Out: mục Lỗi tồn đọng · Dep: M4-09 · Verify: không còn lỗi `CRITICAL` mở
  - Bằng chứng: —
- [ ] **M4-11** Tái lập: clone mới vào thư mục trống, làm theo `README.md` (cập nhật runbook ngắn trỏ tới §A10.5)
  - In: §A10.5 · Out: `README.md` + vấn đề gặp phải · Dep: M4-09 · Verify: từ clone tới đăng nhập ở `:5173` không cần bước ngoài README
  - Bằng chứng: —
- [ ] **M4-12** [OWNER] Diễn tập demo local (phần 2–5 phút trong kịch bản S2)
  - In: kịch bản demo S2 · Out: nhận xét · Dep: M4-11 · Verify: đăng nhập → tải lên → tìm kiếm → kiểm tra Public/Private
  - Bằng chứng: —
- [ ] **M4-G** [OWNER] Gate M4: xác nhận local full-stack đạt để sang M5
  - In: bằng chứng M4 · Out: quyết định · Dep: M4-10, M4-12 · Verify: owner ghi "ĐỒNG Ý" hoặc danh sách cần sửa
  - Bằng chứng: —

---

## M5 — AWS Deployment Preparation

Agent: `INTEGRATION` · **Không provisioning** khi chưa có M5-G. Đầu ra là đề xuất cập nhật §A10 (qua Nhật ký thay đổi baseline) và bản nháp cấu hình/script **không thực thi**.

- [ ] **M5-01** Rà soát stateless: trạng thái trong bộ nhớ, ghi file ngoài `UPLOAD_TMP_DIR`, phụ thuộc hostname/cổng
  - In: §A10.9 · Out: checklist + kết quả `grep` · Dep: M4-G · Verify: mọi trạng thái ở RDS/S3 hoặc là tệp tạm theo request; rate limit theo instance đã ghi nhận
  - Bằng chứng: —
- [ ] **M5-02** Yêu cầu triển khai EC2: chốt OD-06 với owner; cấu trúc artifact, Node runtime, systemd unit, user data, bước migration
  - In: §A10.7, U-01 · Out: đề xuất cập nhật §A10.7; nháp trong `deploy/` · Dep: M5-01, OD-06 · Verify: owner review; không bước nào cần access key
  - Bằng chứng: —
- [ ] **M5-03** Kế hoạch RDS: 8.4, class, Single-AZ, subnet group, SG, TLS, backup, charset, user/quyền, bí mật (OD-07)
  - In: §A10.8, §A10.9, U-03 · Out: bảng cấu hình · Dep: M5-02 · Verify: khớp collation §A4.3 và SG §A10.9
  - Bằng chứng: —
- [ ] **M5-04** Kế hoạch S3: tên bucket, Block Public Access, Ownership, SSE-S3, **tắt versioning**, lifecycle huỷ multipart, Gateway Endpoint + route table
  - In: §A6.2, §A10.9 · Out: bảng cấu hình · Dep: M5-01 · Verify: khớp BR-08 và NFR-SEC-06
  - Bằng chứng: —
- [ ] **M5-05** Kế hoạch ALB/ASG: listener theo OD-05, health check, timeout §A10.4, launch template, min 2/desired 2/max 4, scaling (OD-09), instance refresh
  - In: §A10.9, U-02, U-05 · Out: bảng cấu hình · Dep: M5-02, OD-05 · Verify: biến cookie/HSTS/`ALLOWED_ORIGINS` nhất quán với OD-05
  - Bằng chứng: —
- [ ] **M5-06** Kế hoạch IAM: role, instance profile, policy JSON có tên bucket thật, managed policy theo OD-06/07
  - In: §A10.9 · Out: policy JSON · Dep: M5-02, M5-04 · Verify: least privilege (prefix `documents/*`); `git grep -n "AKIA"` không có kết quả
  - Bằng chứng: —
- [ ] **M5-07** Kế hoạch CloudWatch: metric, 4 alarm, SNS, gửi log theo OD-06, **quy trình kích hoạt thử alarm**
  - In: §A10.9, NFR-OBS-01 · Out: bảng alarm + quy trình · Dep: M5-05 · Verify: ≥ 1 alarm kích hoạt được bằng thao tác xác định (dừng service → `UnHealthyHostCount`)
  - Bằng chứng: —
- [ ] **M5-08** Kế hoạch thử tải: công cụ, kịch bản (ưu tiên `GET /api/documents`), cách tăng tải, điều kiện dừng; tiêu chí = **quan sát được** scale-out (không đặt trước con số); chạy thử script ở local `:3000`
  - In: NFR-SCL-02, RK-05, OD-09 · Out: script + kế hoạch + kết quả local · Dep: M5-05 · Verify: script chạy ở local; số liệu local không suy diễn cho AWS
  - Bằng chứng: —
- [ ] **M5-09** Rà soát chi phí và mạng: cập nhật dự toán (NAT/endpoint/tên miền/IPv4) bằng Pricing Calculator; đối chiếu DS-03, DS-04; Service Quotas; AWS Budgets
  - In: S2 mục 8, U-01…U-08 · Out: dự toán mới kèm link/ảnh · Dep: M5-02…M5-07 · Verify: mọi con số có nguồn; khác biệt với S2 được giải thích
  - Bằng chứng: —
- [ ] **M5-10** Bản nháp runbook triển khai AWS + rollback + teardown
  - In: M5-01…M5-09 · Out: đề xuất cập nhật §A10 · Dep: M5-09 · Verify: owner review
  - Bằng chứng: —
- [ ] **M5-G** [OWNER] Quyết định có cho phép provisioning AWS (ngoài baseline)
  - In: M5 · Out: quyết định + phạm vi · Dep: M5-10 · Verify: owner ghi quyết định
  - Bằng chứng: —

---

## Nhật ký thay đổi baseline

Mọi thay đổi CONTEXT/ARCHITECTURE sau khi owner duyệt. Trạng thái `PROPOSED` → `APPROVED` / `REJECTED` (chỉ OWNER đổi).

| ID | Ngày | Người đề xuất | Mục | Thay đổi | Lý do | Trạng thái |
|---|---|---|---|---|---|---|
| CR-000 | 2026-10-20 | CLAUDE_DESIGN | Toàn bộ | Tạo baseline v1.0 | M0 | PROPOSED |
| CR-001 | 2026-10-20 | CLAUDE_BACKEND | ARCHITECTURE §A10.1, §A10.5, §A1.3, RK-06 | Object storage local đổi MinIO → **SeaweedFS 4.48** (`chrislusf/seaweedfs:4.48`, map `9000:8333`, cấu hình `docker/seaweedfs/s3.json`, cờ `-volume.max=100 -master.volumeSizeLimitMB=1024`); bỏ service `minio-init`, thay bằng bước `npm --prefix backend run storage:init` sau `docker compose up -d`. Biến môi trường và adapter giữ nguyên | MinIO ngừng phát hành: `dl.min.io` 410, Docker Hub `minio/minio` 404. Owner chọn "Vẫn dùng Docker" với SeaweedFS trong chat 2026-10-20 | PROPOSED (owner đổi sang APPROVED) |
| CR-002 | 2026-10-20 | CLAUDE_BACKEND | ARCHITECTURE §A10.5, §A10.6 | `backend/package.json` thêm `postinstall: prisma generate`, script `storage:init`, mục `allowScripts` (npm 11 chặn install script); runbook §A10.5 thêm bước `storage:init` | Bản cài sạch (CI) cần Prisma client trước bước lint; npm 11 không chạy install script nếu không được cho phép | PROPOSED |
| CR-003 | 2026-10-20 | CLAUDE_BACKEND | ARCHITECTURE §A4.6, §A10.6 | Ghi nhận: Prisma 6.19 chặn `prisma migrate reset` khi được gọi bởi AI agent; global setup integration vẫn dùng reset theo §A4.6 nhưng từ chối DB không có hậu tố `_test`. Agent chạy integration test cần owner đồng ý (biến `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`). Phương án thay thế nếu owner muốn: dùng `migrate deploy` + xoá dữ liệu bằng code test | Chốt an toàn của Prisma, owner đã đồng ý cho `btl_cloud_test` ngày 2026-10-20 | PROPOSED |
| CR-004 | 2026-10-20 | CLAUDE_BACKEND | ARCHITECTURE §A10.1, §A10.5 | Thêm `run.bat` ở gốc repo (chỉ Windows, chỉ dev): có Docker → `docker compose up -d --wait`; không có Docker → tự tải MySQL 8.4.7 + SeaweedFS 4.48 bản portable vào `%LOCALAPPDATA%\btl-cloud-services` (root MySQL không mật khẩu, chỉ nghe 127.0.0.1; tạo DB/user giống compose + chạy `docker/mysql/init/01-init.sql`), rồi `prisma:deploy`, `storage:init`, mở backend :3000 + frontend :5173 và trình duyệt. `run.bat stop` tắt tất cả. Compose vẫn là môi trường chuẩn để kiểm M1-03 | Owner yêu cầu "1 file .bat để chạy toàn bộ dự án" (chat 2026-10-20); máy owner chưa có Docker. Đã kiểm: chạy từ trạng thái tắt → ready sau 41 s, `stop` giải phóng cả 4 cổng | PROPOSED |

## Lỗi tồn đọng

Do `INTEGRATION` quản lý; agent khác chỉ thêm dòng mới. Mức độ: `CRITICAL` (vi phạm BR/bảo mật/mất dữ liệu) · `MAJOR` (FR không đạt) · `MINOR`.

| Bug ID | Phát hiện ở | Mô tả | Tham chiếu | Mức độ | Phụ trách | Trạng thái |
|---|---|---|---|---|---|---|
| — | — | Chưa có | — | — | — | — |

---

## FINAL OWNER ACCEPTANCE

> Tách biệt với tiến độ của agent. Agent chỉ được thêm "Bằng chứng agent", **không bao giờ** tick. Chỉ owner tick sau khi tự kiểm tra.

- [ ] **ACC-01** Bao phủ yêu cầu · CONTEXT §C4, ARCHITECTURE §A11.1
  - Làm: với mỗi FR-01…FR-09, đối chiếu §A11.1 và kết quả theo AC ở M4-04 → Mong đợi: 9/9 FR có UC, API, Page, test; mọi AC PASS (tự động hoặc thủ công)
  - Bằng chứng agent: —
- [ ] **ACC-02** Use Case đúng · ARCHITECTURE §A2.4
  - Làm: trên ứng dụng đang chạy, chạy luồng chính và ít nhất một luồng lỗi của từng UC-01…UC-12 → Mong đợi: khớp mô tả
  - Bằng chứng agent: —
- [ ] **ACC-03** Kiến trúc nhất quán · ARCHITECTURE §A1.3, §A1.4, §A3
  - Làm: so cấu trúc repo với §A1.3; chạy `git grep -n "@prisma/client" -- backend/src/modules/*/*.controller.ts` và `git grep -n "@aws-sdk" -- backend/src ":!backend/src/storage/s3-object-storage.ts"` → Mong đợi: cấu trúc khớp; hai lệnh không có kết quả
  - Bằng chứng agent: —
- [ ] **ACC-04** Cơ sở dữ liệu · ARCHITECTURE §A4.3
  - Làm: `docker compose exec mysql mysql -ubtl -pbtl_dev_password btl_cloud -e "SHOW CREATE TABLE users; SHOW CREATE TABLE sessions; SHOW CREATE TABLE documents; SHOW CREATE TABLE storage_cleanup_tasks;"` → Mong đợi: PK, FK (CASCADE/RESTRICT), UNIQUE, index, kiểu cột, nullability đúng; `visibility` không có mặc định
  - Bằng chứng agent: —
- [ ] **ACC-05** API và frontend tương thích · ARCHITECTURE §A7, §A8.12; M4-03
  - Làm: DevTools › Network khi tìm kiếm, tải lên, sửa, xoá; so với §A7.7 → Mong đợi: tên trường, mã trạng thái, envelope khớp; 18/18 dòng F-xx đạt
  - Bằng chứng agent: —
- [ ] **ACC-06** Xác thực · FR-01, ARCHITECTURE §A5
  - Làm: đăng ký, đăng xuất, đăng nhập; DevTools › Cookies: cookie phiên có HttpOnly; Console `document.cookie` không chứa nó; Storage không có token; chép cookie trước khi đăng xuất rồi `curl -b "sid=<giá trị>" http://localhost:3000/api/documents/mine` → Mong đợi: curl trả 401 `UNAUTHENTICATED`
  - Bằng chứng agent: —
- [ ] **ACC-07** Phân quyền Public/Private · CONTEXT §C3.2, BR-01…03, BR-11
  - Làm: A tải lên 1 Public + 1 Private; B tìm kiếm, mở link chi tiết Private, gọi URL tải Private; Guest bấm tải tài liệu Public → Mong đợi: B không thấy Private, chi tiết "Không tìm thấy", tải → 404; Guest bị chuyển tới đăng nhập
  - Bằng chứng agent: —
- [ ] **ACC-08** Giới hạn và kiểm tra upload · FR-04, FR-05, BR-04, BR-05
  - Làm: tải lên mỗi loại PDF/DOCX/PPTX; thử tệp > 50 MB, `.txt` đổi tên `.pdf`, gửi khi chưa chọn chế độ → Mong đợi: 3 tệp hợp lệ thành công; 3 trường hợp sau bị từ chối với thông báo tiếng Việt rõ ràng
  - Bằng chứng agent: —
- [ ] **ACC-09** Upload thất bại · BR-06, ARCHITECTURE §A6.3, SEQ-03
  - Làm: `docker compose stop minio` → thử tải lên → `docker compose start minio` → sau ~2 phút xem P-01, P-05 và MinIO console `http://localhost:9001` → Mong đợi: upload báo lỗi; không có tài liệu mới; bucket không có object mồ côi
  - Bằng chứng agent: —
- [ ] **ACC-10** Thay thế an toàn · FR-08, BR-07, ARCHITECTURE §A6.6
  - Làm: (1) thay tệp một tài liệu Public rồi tải xuống; (2) `stop minio` → thử thay → `start minio` → tải xuống; (3) sau (1) chờ > 2 phút, xem MinIO console → Mong đợi: (1) nội dung mới, nhãn vẫn "Công khai"; (2) báo lỗi, vẫn ra tệp **cũ**; (3) chỉ còn object mới
  - Bằng chứng agent: —
- [ ] **ACC-11** Xoá vĩnh viễn · FR-09, BR-08, ARCHITECTURE §A6.7, SEQ-09
  - Làm: (1) xoá một tài liệu, mở lại link chi tiết và URL tải; (2) `stop minio` → xoá tài liệu khác → `start minio` → chờ vài phút → MinIO console → Mong đợi: (1) 404 ở mọi nơi, object mất; (2) xoá báo thành công, object mất sau khi storage hoạt động lại
  - Bằng chứng agent: —
- [ ] **ACC-12** Frontend dễ dùng · ARCHITECTURE §A8, NFR-USA-01/02
  - Làm: chạy toàn bộ luồng trên desktop và giả lập 360 px; một lần tải lên chỉ dùng bàn phím; xem trạng thái rỗng (tài khoản mới) và lỗi (dừng backend) → Mong đợi: nhãn tiếng Việt nhất quán, không cuộn ngang, có tiến độ upload, lỗi dễ hiểu
  - Bằng chứng agent: —
- [ ] **ACC-13** Kiểm thử và tái lập · ARCHITECTURE §A10.6; M4-09, M4-11
  - Làm: ở clone mới, làm theo README; chạy `npm ci && npm run lint && npm run build && npm test`, `npm --prefix backend run test:integration`, `npm --prefix frontend run test:e2e` → Mong đợi: không cần bước ngoài README; mọi lệnh thoát 0
  - Bằng chứng agent: —
- [ ] **ACC-14** Demo local nhiều instance · NFR-SCL-01, ARCHITECTURE §A10.5; M4-08
  - Làm: chạy 2 backend production-like (`:3000`, `:3001`); đăng nhập ở `:3000` rồi mở "Tài liệu của tôi" ở `:3001`; gọi `/api/health` ở hai cổng; diễn lại đăng ký → tải lên → tìm → tải xuống → sửa → thay → xoá → Mong đợi: phiên dùng được ở cả hai; `instanceId` khác nhau; kịch bản chạy trơn tru
  - Bằng chứng agent: —
- [ ] **ACC-15** Sẵn sàng AWS · ARCHITECTURE §A10.7–A10.10; M5
  - Làm: review M5-01…M5-10; xác nhận OD-05/06/07/09 đã quyết; xem dự toán mới; `git grep -nE "AKIA|aws_secret_access_key"` → Mong đợi: kế hoạch đủ 8 hạng mục bắt buộc (S5); chi phí có nguồn; không có access key trong repo
  - Bằng chứng agent: —
