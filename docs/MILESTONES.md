# MILESTONES — Kế hoạch, tiến độ và nghiệm thu

> Tài liệu 3/3 của Design Baseline v1.0: **CÔNG VIỆC, TIẾN ĐỘ, KIỂM CHỨNG, NGHIỆM THU**. Yêu cầu: [CONTEXT.md](CONTEXT.md). Thiết kế: [ARCHITECTURE.md](ARCHITECTURE.md).
>
> `BASELINE_VERSION: 1.0` · `OWNER_APPROVED_M0: YES` cho tới khi owner phê duyệt ở [OWNER DESIGN APPROVAL](#owner-design-approval).


---

## Quy tắc và milestone

Dùng nhánh feature/*, fix/*, chore/*. PR cần CI job `ci-required` và code owner review. Chỉ tick task sau khi đã kiểm chứng, kèm một dòng bằng chứng. Các ô [OWNER] và FINAL OWNER ACCEPTANCE do owner tự nghiệm thu.

| Milestone | Phạm vi | Trạng thái |
|---|---|---|
| M0 | Thiết kế | Owner đã duyệt |
| M1–M2 | Backend, DB, storage | Đã triển khai; xác minh lại ở M4 |
| M3 | Frontend | Đã ghép lịch sử |
| M4 | Local prototype | Đang kiểm thử; M4-07/08 hoãn CR-005 |
| M5 | Chuẩn bị AWS | Chưa làm |

---

## M0 — Requirements, Architecture & UX/UI Design


- [x] **M0-01** Kiểm tra repository và tài liệu nguồn
  - In: repo, tệp đề xuất trên máy owner · Out: CONTEXT §C0, §C6.5 · Dep: — · Verify: nguồn trích bằng đường dẫn thật, nội dung khớp bản gốc
  - Bằng chứng: (lịch sử M0–M3) Repo chỉ có `README.md`, `.github/` (1 commit `841adba`). Trích text bằng `pdftotext -enc UTF-8 -layout` (đề xuất + hướng dẫn) và Python `zipfile` (4 bản docx, so sánh bằng.

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
  - Bằng chứng: ARCHITECTURE §A4, §A6; CR-007 thay hàng đợi bằng bù trừ best-effort; 3 bảng hiện hành.

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
  - Bằng chứng: (lịch sử M0–M3) Theo yêu cầu owner (2026-10-20) đã thêm sơ đồ module (§A1.3, §A3.2.1–A3.2.4, §A3.3.1–A3.3.2, §A3.8, §A5.5, §A6.8, §A8.7, §A8.12). Kiểm tra bằng parser thật `mermaid@11.4.1` +.

- [x] **M0-10** Ánh xạ local/AWS
  - In: S2, S3, S7 · Out: ARCHITECTURE §A10 · Dep: M0-04 · Verify: không provisioning; không bịa giá; egress/NAT/endpoint/HTTPS/chi phí ghi là chưa giải quyết
  - Bằng chứng: §A10.1–A10.10 (U-01…U-08).

- [x] **M0-11** Kiểm tra chéo toàn bộ tài liệu
  - In: 3 tài liệu · Out: ARCHITECTURE §A11; sửa điểm không nhất quán · Dep: M0-03…M0-10 · Verify: script kiểm tra ID/anchor/tham chiếu mục + parser Mermaid
  - Bằng chứng: (lịch sử M0–M3) Lần chạy cuối sau khi rút gọn (2026-10-20). Script Python trong scratchpad (không commit) → **`PROBLEMS: 0`**: mọi ID tham chiếu đều đã định nghĩa (FR 9, AC 36, BR 11, NFR 31, OD.

- [x] **M0-12** Chuẩn bị cho owner review
  - In: 3 tài liệu · Out: OWNER DESIGN APPROVAL; danh sách OD (CONTEXT §C6.6); báo cáo tóm tắt · Dep: M0-11 · Verify: không ô phê duyệt nào bị agent tick; `OWNER_APPROVED_M0: YES`
  - Bằng chứng: (lịch sử M0–M3) Theo yêu cầu owner, đã rút gọn 3 tài liệu (giữ nguyên sơ đồ, hợp đồng API, schema, đặc tả màn hình); bản trước được sao lưu trong scratchpad. Tài liệu nằm trên nhánh.

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


> **Môi trường kiểm chứng lịch sử (2026-10-20):** máy chưa có Docker (M1-00), nên integration test và chạy thử đều dùng **MySQL 8.4.7 bản zip + SeaweedFS 4.48 bản Windows** (cùng phiên bản với image `mysql:8.4` và `chrislusf/seaweedfs:4.48` trong compose), chạy tạm trong scratchpad của phiên. DB được khởi tạo bằng đúng `docker/mysql/init/01-init.sql`; SeaweedFS dùng đúng `docker/seaweedfs/s3.json`. Riêng **file compose chưa được chạy** (M1-03).

- [ ] **M1-00** [OWNER] Cài Docker Desktop (backend WSL2)
  - In: AS-02, OD-14 · Out: Docker chạy được · Dep: — (làm ngay được) · Verify: `docker compose version` in phiên bản; `docker run --rm hello-world` thành công
  - Bằng chứng: —
- [x] **M1-01** Khởi tạo `backend/`: TS strict, ESLint, Vitest, khung `src/` theo §A1.3; script `dev`, `build`, `start`, `lint`, `test`, `test:integration`, `prisma:deploy`
  - In: §A1.1, §A1.3, §A1.4 · Out: `backend/package.json` + lockfile, `tsconfig.json`, `eslint.config.js`, `vitest.config.ts` · Dep: Gate M0 · Verify: `npm --prefix backend run build`, `lint`, `test` thoát 0; ghi phiên bản đã ghim của Express, Prisma, AWS SDK
  - Bằng chứng: (lịch sử M0–M3) `backend/package.json` (phiên bản ghim chính xác: express 5.3.0, @prisma/client + prisma 6.19.3, @aws-sdk/client-s3 + lib-storage 3.1153.0, zod 3.25.76, multer 2.4.0, argon2.
- [x] **M1-02** Root `package.json` (không dependency), `scripts/run-all.mjs`, `.gitignore` (`node_modules`, `dist`, `.env`, `tmp`)
  - In: D-16, `ci.yml` · Out: script root `postinstall`/`lint`/`build`/`test` · Dep: M1-01 · Verify: ở root `npm ci && npm run lint && npm run build && npm test` thành công khi chưa có `frontend/`
  - Bằng chứng: (lịch sử M0–M3) `package.json`, `package-lock.json` (root, rỗng), `scripts/run-all.mjs` (thêm tham số lọc package, ví dụ `node scripts/run-all.mjs test backend`), `.gitignore`. Kiểm trên **bản.
- [ ] **M1-03** `docker-compose.yml` + `docker/mysql/init/01-init.sql` theo §A10.1; ghim tag MinIO/mc còn tải được (RK-06)
  - In: §A10.1 · Out: compose `mysql`, `minio`, `minio-init` · Dep: M1-00 · Verify: `docker compose ps` → mysql, minio healthy, minio-init exit 0; 2 bucket tồn tại; GET ẩn danh một object → 403; có `btl_cloud_test`
  - Bằng chứng: (lịch sử M0–M3) **IMPLEMENTED / NOT VERIFIED — BLOCKED bởi M1-00 (chưa có Docker).** MinIO không còn dùng được: `dl.min.io` trả 410 Gone, `hub.docker.com/v2/repositories/minio/minio` trả 404 →.
- [x] **M1-04** `config/env.ts` (zod) + `.env.example` theo §A10.2
  - In: §A10.2, D-17 · Out: `Config` bất biến · Dep: M1-01 · Verify: unit test: thiếu `DATABASE_URL` → lỗi nêu tên biến; mặc định đúng bảng; parse boolean/number đúng
  - Bằng chứng: (lịch sử M0–M3) `src/config/env.ts`, `backend/.env.example`; `test/unit/config.test.ts` (4 test pass): thiếu `DATABASE_URL` → `ConfigError` nêu tên biến; mặc định khớp §A10.2; parse.
- [x] **M1-05** `schema.prisma` + migration `init` (4 bảng, PK, FK, UNIQUE, index, kiểu cột) theo §A4.3
  - In: §A4 · Out: `prisma/schema.prisma`, `prisma/migrations/<ts>_init/` · Dep: M1-03 · Verify: `prisma:deploy` trên DB trống; `SHOW CREATE TABLE` 4 bảng khớp §A4.3 (dán tóm tắt); collation `utf8mb4_0900_ai_ci`
  - Bằng chứng: (lịch sử M0–M3) Dùng lại phần database của **Antigravity** (owner cho phép): giữ migration `20261020100306_init` (đã sửa collation `utf8mb4_0900_ai_ci`, có chú thích), chỉ thêm `DEFAULT.
- [x] **M1-06** `db/prisma.ts`; interface `ObjectStorage`; `S3ObjectStorage`; `InMemoryObjectStorage` có chèn lỗi
  - In: §A3.2.4, §A6.2 · Out: `src/storage/*`, `src/db/prisma.ts` · Dep: M1-03, M1-04 · Verify: integration với MinIO: put → get (so byte) → delete → delete lần 2 không lỗi → `checkHealth`; bucket sai → `StorageError UNAVAILABLE`
  - Bằng chứng: (lịch sử M0–M3) `src/db/prisma.ts` (factory thay singleton của Antigravity + `TransactionRunner` để service không phụ thuộc PrismaClient),.
- [x] **M1-07** `createApp` + middleware nền (requestId, logger redact, helmet/CSP, JSON 16 KB, cookie, `notFound`, `errorHandler`, `no-store`), timeout server §A10.4, graceful shutdown §A10.5
  - In: §A3.8, §A5.8, §A7.1–A7.3 · Out: `src/app.ts`, `src/server.ts`, `src/http/**` · Dep: M1-04 · Verify: Supertest: `/api/khong-co` → 404 `ROUTE_NOT_FOUND` có `details: []` và `requestId` = header; JSON hỏng → `INVALID_JSON`; 17 KB → `PAYLOAD_TOO_LARGE`; có CSP và nosniff
  - Bằng chứng: (lịch sử M0–M3) `src/app.ts`, `src/server.ts` (requestTimeout 900 s, keepAlive 125 s, headers 126 s; `prisma.$connect()` sớm), `src/lifecycle.ts`, `src/http/**`. `test/unit/app.test.ts`: 404.
- [x] **M1-08** API-01 và API-02
  - In: §A7.7 · Out: `src/modules/health/*` · Dep: M1-06, M1-07 · Verify: API-01 đủ 4 trường, vẫn 200 khi DB sai cấu hình; API-02 → 503 với `details[].field = database` / `storage` khi thành phần lỗi
  - Bằng chứng: (lịch sử M0–M3) `src/modules/health/health.routes.ts`. Unit: API-01 đủ 4 trường, `$queryRaw` không được gọi; API-02 200 / 503 `database` / 503 `storage`. Chạy thử bản build thật phát hiện API-02.
- [x] **M1-09** Phục vụ SPA khi `SERVE_FRONTEND=true` (§A3.7)
  - In: §A3.7 · Out: `src/http/static.ts` · Dep: M1-07 · Verify: với dist mẫu: `/` → index.html `no-cache`; `/assets/a.js` → `immutable`; `/me/documents` (Accept html) → index.html; `/api/khong-co` → JSON 404
  - Bằng chứng: `src/http/static.ts`; `test/unit/app.test.ts` › "Phục vụ SPA cùng origin": đủ 4 điều kiện trên + `SERVE_FRONTEND=false` chỉ phục vụ API. Chưa kiểm với `frontend/dist` thật (thuộc M4-02).
- [x] **M1-10** Hạ tầng test: tách unit/integration, `migrate reset` trên DB test, helper xoá dữ liệu, fixtures (PDF/DOCX/PPTX hợp lệ, `.txt` đổi đuôi, ZIP thường đổi đuôi `.docx`, 0 byte, tên tiếng Việt, tệp 52 428 800 và 52 428 801 byte sinh lúc chạy)
  - In: §A10.6 · Out: `vitest.config.ts`, `test/**` · Dep: M1-05 · Verify: `npm --prefix backend test` (không Docker) và `test:integration` (có compose) đều pass; ghi số test
  - Bằng chứng: (lịch sử M0–M3) `test/helpers/{config,fixtures,fault-storage,contract}.ts`, `test/integration/{global-setup,context}.ts`. Lần chạy cuối: `npm test` → **7 file, 67 passed**; `npm run.
- [x] **M1-11** Kiểm tra tương thích CI; soạn đề xuất job integration test (OD-08) **dạng văn bản trong bằng chứng**, không sửa `.github/`
  - In: `ci.yml` · Out: kết quả lệnh tương đương CI + đề xuất · Dep: M1-02, M1-10 · Verify: root `npm ci && npm run lint && npm run build && npm test` thoát 0; nếu push `feature/**` thì ghi kết quả `ci-required`
  - Bằng chứng: (lịch sử M0–M3) Mô phỏng đúng các bước của `ci-required` trên bản sao sạch (xem M1-02) → 4 bước exit 0. Chưa push (owner yêu cầu không commit) nên chưa có kết quả GitHub Actions. **Đề xuất cho.

---

## M2 — Backend Authentication & Documents


- [x] **M2-01** `password.ts` (argon2id m=19456, t=2, p=1), token/hash phiên, `SessionRepository`, `UserRepository`
  - In: §A5.1, §A5.2 · Out: `modules/auth/*`, `modules/users/*` · Dep: M1-05 · Verify: hash có tiền tố `$argon2id$`; verify đúng/sai; token 43 ký tự base64url; hash 64 hex
  - Bằng chứng: (lịch sử M0–M3) `src/modules/auth/{password,session-token,session.repository}.ts`, `src/modules/users/*`. `auth.test.ts` › AC-01.6: hash lưu dạng `$argon2id$v=19$m=19456,p=1,t=2$…`, không chứa.
- [x] **M2-02** `csrfGuard` (§A5.4)
  - In: §A5.4 · Out: middleware · Dep: M1-07 · Verify: POST thiếu header → 403 `CSRF_REJECTED`; `Origin: http://evil.example` → 403; Origin hợp lệ → qua; không Origin + có header → qua; GET không bị ảnh hưởng
  - Bằng chứng: `src/http/middleware/auth.ts` › `csrfGuard`; `test/unit/app.test.ts` › "CSRF": đủ 5 điều kiện + header sai giá trị (`true`) → 403 + multipart bị từ chối trước khi đọc body vẫn trả JSON 403.
- [x] **M2-03** `sessionLoader`, `requireAuth`, helper cookie (§A5.3), xử lý hết phiên (§A5.7)
  - In: §A5.2, §A5.3, §A5.7 · Out: middleware · Dep: M2-01 · Verify: không cookie → `null`; cookie lạ → bị xoá; hết hạn → bản ghi + cookie bị xoá, route cần auth trả 401; thuộc tính `Set-Cookie` theo `COOKIE_SECURE`/`SESSION_COOKIE_NAME`
  - Bằng chứng: (lịch sử M0–M3) `src/http/middleware/auth.ts`, `src/modules/auth/session.cookie.ts`. `auth.test.ts`: cookie giả → `user: null` + `sid=; Max-Age=0`; phiên hết hạn → API-08 401, bản ghi bị xoá,.
- [x] **M2-04** API-03, 04, 05, 06 + `authRateLimit`
  - In: §A7.7, §A5.6 · Out: `auth.routes/controller/service/schemas` · Dep: M2-02, M2-03 · Verify: AC-01.1–01.6 ở mức API: 201 + `HttpOnly`; trùng email khác hoa thường → 409; sai mật khẩu và email không có → body giống nhau (trừ `requestId`); sau logout cookie cũ → API-08 401, API-03 `user: null`; vượt giới hạn → 429 + `Retry-After`; trường lạ → `UNKNOWN_FIELD`
  - Bằng chứng: (lịch sử M0–M3) `src/modules/auth/*`. `auth.test.ts` (11 pass) phủ đủ các điều kiện trên, thêm: xoay phiên khi đăng nhập; phiên tạo ở instance A dùng được ở instance B và logout ở A vô hiệu ở B.
- [x] **M2-05** `document.policy.ts` + `document.loader.ts` (kiểm quyền trước khi đọc body)
  - In: §A5.5, CONTEXT §C3.2 · Out: policy + loader · Dep: M2-03 · Verify: unit test đủ ma trận {Guest, non-owner, owner} × {PUBLIC, PRIVATE} × {view, manage}; non-owner PUT `/file` tệp 10 MB → 403/404 và thư mục tạm **không** có tệp mới
  - Bằng chứng: (lịch sử M0–M3) `src/modules/documents/{document.policy,document.loader}.ts`; `test/unit/policy.test.ts` (10 ô ma trận pass); `documents-access.test.ts` › ma trận quản lý (thay/xoá: Public 403,.
- [x] **M2-06** `upload.middleware`, `file-inspector`, `storage-keys`, `content-disposition`
  - In: §A6.3 (U2), §A6.4, API-13 · Out: `modules/files/*` · Dep: M1-10 · Verify: 3 loại hợp lệ → đúng `fileType`/MIME; `.txt`→`.pdf` và ZIP→`.docx` → 415; 0 byte → `EMPTY_FILE`; 52 428 800 qua, +1 → 413; 2 tệp → `TOO_MANY_FILES`; "Đề cương Giải tích 1.pdf" giữ đúng tên; thư mục tạm rỗng sau mỗi case; `Content-Disposition` khớp ví dụ §A7.7
  - Bằng chứng: (lịch sử M0–M3) `src/modules/files/*`. `test/unit/files.test.ts` + `upload-middleware.test.ts` + `documents-upload.test.ts`: đủ mọi điều kiện trên (biên 52 428 800 / 52 428 801 chạy cả ở unit và.
- [x] **M2-07** API-10 PutObject → INSERT, bù trừ best-effort (CR-007)
  - Bằng chứng: documents-upload.test.ts: upload/storage/DB lỗi, thiếu visibility; chạy lại ở M4-09.

- [x] **M2-08** API-07 và API-08 (lọc, sắp xếp, phân trang, escape `LIKE`)
  - In: §A7.6 · Out: `searchPublic`, `listMine` · Dep: M2-07 · Verify: Private không bao giờ có ở API-07; API-08 chỉ của mình; `q=%` theo nghĩa đen; "giai tich" thấy "Giải tích"; **ghi lại** kết quả "dai so" vs "Đại số" (RK-08); `totalPages` đúng; trang vượt → `items: []`; tham số sai → 400
  - Bằng chứng: (lịch sử M0–M3) `src/modules/documents/document.repository.ts` › `search` (SQL có `ESCAPE '!'`). `documents-search.test.ts` (8 pass) đủ điều kiện trên, thêm `_` và `!` theo nghĩa đen, owner tìm.
- [x] **M2-09** API-09 và API-13 (stream)
  - In: §A6.5, §A7.7 · Out: `getForViewer`, `openDownload` · Dep: M2-07 · Verify: Guest xem Public → `isOwner: false`; Private người khác → 404; Guest tải → 401; owner tải Private → SHA-256 trùng (AC-03.3); đủ header; storage dừng → 503 JSON; object mất → 503 + log `download.object_missing`
  - Bằng chứng: (lịch sử M0–M3) `documents-access.test.ts` (API-09/API-13): đủ điều kiện trên; header đúng nguyên văn (`Content-Disposition: attachment; filename="rieng.pdf"; filename*=UTF-8''rieng.pdf`,.
- [x] **M2-10** API-11 (metadata, chế độ hiển thị)
  - In: §A7.7 · Out: `updateMetadata` · Dep: M2-05 · Verify: sửa một phần; `description: null` xoá mô tả; `{}` → `NO_CHANGES`; `title: null` → `INVALID_TYPE`; non-owner Public 403 / Private 404; đổi sang PRIVATE → biến mất khỏi API-07 ngay; `fileVersion` không đổi
  - Bằng chứng: (lịch sử M0–M3) `documents-access.test.ts` (API-11): đủ điều kiện trên + thiếu CSRF → 403, Guest → 401, `storage_key` không đổi. Hành vi ghi nhận: body chỉ có trường lạ → trả cả `UNKNOWN_FIELD`.
- [x] **M2-11** API-12 immutable key, fileVersion +1, last-write-wins (CR-007)
  - Bằng chứng: documents-replace-delete.test.ts: giữ metadata/visibility, 503 giữ tệp cũ, 404 bù trừ key mới, storage.orphan.

- [x] **M2-12** API-14 DELETE DB → xoá object best-effort (CR-007)
  - Bằng chứng: documents-replace-delete.test.ts: 204 khi storage lỗi, tài liệu mất khỏi API, log storage.orphan.

- [x] **M2-13** Dọn tệp tạm và phiên hết hạn lúc khởi động (CR-007)
  - Bằng chứng: server.ts, tmp-sweeper.ts; không worker định kỳ, không bảng cleanup.

- [x] **M2-14** Log: trường requestId, method, path, status, durationMs, userId, instanceId; sự kiện `cleanup.*`, `download.object_missing`; redact
  - In: §A5.8, NFR-OBS-02 · Out: cấu hình logger · Dep: M2-04 · Verify: log khi đăng nhập/upload không chứa mật khẩu, cookie, `Set-Cookie`
  - Bằng chứng: (lịch sử M0–M3) `src/lib/logger.ts`, `src/http/middleware/request-context.ts`. `contract.test.ts`: log JSON của request có `requestId`, `req.method`, `req.url`, `res.statusCode`, `durationMs`,.
- [x] **M2-15** Contract test API-01…API-14 (đủ trường và đúng kiểu DTO, envelope lỗi có `details` mảng và `requestId`)
  - In: §A7.2–A7.7 · Out: `test/integration/contract.*.test.ts` · Dep: M2-04…M2-12 · Verify: `test:integration` pass, liệt kê 14 endpoint; sai lệch với §A7 ghi vào Nhật ký thay đổi baseline, không sửa lệch hợp đồng
  - Bằng chứng: (lịch sử M0–M3) `test/integration/contract.test.ts` (2 pass) đi hết vòng đời và kiểm **14/14 endpoint** bằng schema `.strict()` (`test/helpers/contract.ts`); mọi test lỗi dùng `expectError` kiểm.

**Ma trận hợp đồng lịch sử (2026-10-20; đã thay thế bởi kiểm chứng M4 bên dưới)**

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
| API-14 `DELETE /api/documents/{id}` | ✅ | ✅ | ✅ | CR-007: không còn 409 tài liệu |

**Lệnh khởi động local đã chạy (lịch sử):** `npm --prefix backend run prisma:deploy` → `npm --prefix backend run storage:init` → `npm --prefix backend run build` → `PORT=3000 INSTANCE_ID=local-a node --env-file-if-exists=.env dist/server.js` (+ instance `:3001`). Khi có Docker: `docker compose up -d` thay cho MySQL/SeaweedFS bản binary.

---

## M3 — Frontend Foundation & Screens


- [ ] **M3-01** Khởi tạo `frontend/` (Vite + React + TS strict, ESLint, Vitest + RTL + jsdom, proxy §A10.3, script `dev`/`build`/`lint`/`test`/`test:e2e`)
  - In: §A1.1, §A1.3, §A10.3 · Out: khung dự án + lockfile riêng · Dep: Gate M0 · Verify: `build`, `lint`, `test` thoát 0; `npm run build` ở root build được cả hai
  - Bằng chứng: (lịch sử M0–M3) IMPLEMENTED / NOT VERIFIED (chỉ còn kiểm tra từ root; 2026-10-20). Owner phê duyệt trực tiếp trong chat: "Phê duyệt baseline v1.0, triển khai M3"; không tự đổi OWNER DESIGN.
- [x] **M3-02** Token, global CSS, `AppLayout`/`AppHeader`/`AppFooter`/`SkipLink`, đủ 8 route §A8.2, P-08, `document.title`, focus `h1` khi đổi route
  - In: §A8.2–A8.4, §A3.3.1 · Out: `styles/*`, `App.tsx`, layout · Dep: M3-01 · Verify: mỗi route render đúng trang; `/khong-ton-tai` → P-08; `<html lang="vi">`
  - Bằng chứng: (lịch sử M0–M3) `frontend/src/App.tsx`, components/AppLayout.tsx + AppLayout.module.css, styles/tokens.css + global.css, hooks/usePageTitle.ts; đủ 8 route và title, lang=vi, header theo phiên,.
  - Cập nhật theo yêu cầu owner trong chat (2026-10-20): sau khi chụp bản xem trước và owner yêu cầu bộ chọn trên web đang chạy, tích hợp `ThemeProvider`, `ThemePicker` và `src/theme/themes.css`. Có 19 bảng màu từ 22 PNG tham chiếu (gộp màu trùng và cặp sáng/tối), chọn bảng màu độc lập với Sáng/Tối/Theo hệ thống; phản quang nhẹ, nút trên header desktop/mobile, lưu riêng cấu hình giao diện vào localStorage và khôi phục trước khi render. Không lưu phiên/token, không sửa backend/API. Đã kiểm tra trực tiếp tại http://localhost:5173/login, không chèn CSS hay mock dữ liệu để chụp; ảnh tại `C:\Users\admin\.codex\artifacts\btl-cloud-theme-live-20261020`.
- [x] **M3-03** Component dùng chung §A8.5
  - In: §A8.5, §A8.11 · Out: `components/*` · Dep: M3-02 · Verify: `TextField` có `aria-invalid`/`aria-describedby` khi lỗi; `VisibilityPicker` mặc định không chọn; `ConfirmDialog` focus "Huỷ" khi danger, Esc → `onCancel`; `FileDropzone` dùng được bằng bàn phím; `Pagination` có `aria-current`
  - Bằng chứng: (lịch sử M0–M3) frontend/src/components/{ui,VisibilityPicker,FileDropzone,Pagination,SearchBar,documents,ToastProvider}.tsx. Form có label/lỗi liên kết, radio không chọn sẵn, dialog focus Huỷ +.
- [x] **M3-04** API client: `types.ts` (khớp §A7.4), `client.ts`, `upload.ts`, `auth.ts`, `documents.ts`, `errors.ts`
  - In: §A7, §A3.3.2, §A8.12 · Out: `src/api/*` · Dep: M3-01 · Verify: `X-CSRF-Protection: 1` **chỉ** với POST/PUT/PATCH/DELETE; mở `data`; `ApiError` đủ trường; `NETWORK_ERROR`; `ABORTED`; tiến độ; `auth:unauthorized` khi 401 `UNAUTHENTICATED` nhưng **không** khi `INVALID_CREDENTIALS`; bỏ query rỗng; `downloadUrl(id)` đúng
  - Bằng chứng: (lịch sử M0–M3) frontend/src/api/ đủ types/client/upload/auth/documents/errors theo §A7. GET dùng credentials same-origin; CSRF đúng phương thức; mở data/204, giữ details/requestId; lỗi mạng/huỷ;.
- [x] **M3-05** `AuthProvider`, `RequireAuth`, `GuestOnly`, `safeRedirect`, `useDownload`
  - In: §A8.5, §A8.6 · Out: `auth/*`, `lib/safeRedirect.ts`, hook · Dep: M3-04 · Verify: `loading` → spinner; Guest vào route bảo vệ → `/login?redirect=…`; User vào `/login` → P-05; `safeRedirect` từ chối `//evil.com`, `https://evil.com`, `/\evil`; hết phiên → toast + chuyển trang; `useDownload` gọi API-03 rồi điều hướng
  - Bằng chứng: (lịch sử M0–M3) frontend/src/auth/*, lib/safeRedirect.ts, hooks/useDownload.ts. Nạp phiên, route guards, 401, logout và redirect có test. Đã sửa race giữa state phiên và React Router bằng cập.
- [x] **M3-06** P-02 Đăng nhập, P-03 Đăng ký
  - In: §A8.7, §A8.8, §A8.9 · Out: `LoginPage`, `RegisterPage` · Dep: M3-03, M3-05 · Verify: thông điệp đúng §A8.8; `INVALID_CREDENTIALS` → Alert; `EMAIL_ALREADY_EXISTS` → trường Email; điều hướng đúng; giữ `redirect`
  - Bằng chứng: (lịch sử M0–M3) frontend/src/pages/AuthPages.tsx; validate blur/submit và sau lỗi; mật khẩu không trim, email chuẩn hoá, confirmPassword chỉ client; khoá gửi trùng; lỗi trùng email tại trường,.
- [x] **M3-07** P-01 Khám phá
  - In: §A8.7 · Out: `HomePage`, `SearchBar`, `DocumentCard` · Dep: M3-03, M3-05 · Verify: đồng bộ URL; Guest/User thấy đúng nút tải; 2 biến thể rỗng; lỗi → "Thử lại"; `page=abc` → 1 trước khi gọi API
  - Bằng chứng: (lịch sử M0–M3) frontend/src/pages/DocumentListPages.tsx, hooks/useDocumentFilters.ts, SearchBar/DocumentCard/Pagination; query lấy từ URL, tham số sai được chuẩn hoá trước API, pageSize 12;.
- [x] **M3-08** P-04 Chi tiết + luồng tải xuống
  - In: §A8.7 · Out: `DocumentDetailPage` · Dep: M3-07 · Verify: owner thấy Chỉnh sửa/Xoá/nhãn chế độ, non-owner không thấy; 404 → trạng thái không tìm thấy; xoá qua CD-01 → P-05
  - Bằng chứng: (lịch sử M0–M3) frontend/src/pages/DocumentDetailPage.tsx + hooks/useDownload.ts/useDeleteDocument.ts. Metadata, mô tả xuống dòng, action theo isOwner, 404, retry; CD-01 trước API-14, lỗi không.
- [x] **M3-09** P-05 Tài liệu của tôi
  - In: §A8.7 · Out: `MyDocumentsPage`, `MyDocumentList` · Dep: M3-07 · Verify: lọc `visibility` trên URL; CD-01 "Huỷ" → không gọi API; xác nhận → API-14 → gọi lại API-08, lùi trang khi rỗng; 2 biến thể rỗng
  - Bằng chứng: (lịch sử M0–M3) DocumentListPages.tsx/MyDocumentList; bộ lọc URL gồm visibility, bảng desktop/thẻ mobile; rỗng chưa có tài liệu hoặc rỗng do lọc; xoá chỉ sau server xác nhận, lùi trang khi xoá.
- [x] **M3-10** P-06 Tải lên
  - In: §A8.7 · Out: `UploadPage` · Dep: M3-03, M3-04 · Verify: không radio nào chọn sẵn (AC-05.1); tự điền tiêu đề; chặn sai đuôi / 0 byte / quá lớn; nút gửi chỉ bật khi hợp lệ; thứ tự part đúng; có tiến độ; huỷ → `abort`; map lỗi 413/415/503
  - Bằng chứng: (lịch sử M0–M3) UploadPage.tsx, hooks/useUploadTask.ts, lib/validation.ts/constants.ts; PDF/DOCX/PPTX, 1…52_428_800 byte, visibility không mặc định, tự điền tiêu đề, tiến độ XHR,.
- [x] **M3-11** Chỉnh sửa / thay thế / xoá theo CR-007
  - Bằng chứng: EditDocumentPage.tsx; bỏ UI CONFLICT; frontend tests và E2E xác minh ở M4.

- [x] **M3-12** Rà soát responsive và accessibility
  - In: §A8.11 · Out: sửa lỗi + checklist trong bằng chứng · Dep: M3-06…M3-11 · Verify: 360/768/1280 px không cuộn ngang; luồng upload chỉ dùng bàn phím; kiểm tương phản bằng công cụ; `axe` nếu khả thi
  - Bằng chứng: (lịch sử M0–M3) `npm --prefix frontend run test:ui` → 7 passed, 0 failed/skipped/flaky (32,6 s ở lượt cuối), Chrome headless trên production build + route mock đúng schema;.
  - Kiểm tra sau khi tích hợp theme (2026-10-20): build/typecheck, lint và 63 unit/component test pass; 7 browser test cũ pass trên giao diện mới. `npm --prefix frontend run test:ui -- ui-tests/theme.spec.ts` bổ sung 4 browser test pass: đổi bảng màu/chế độ độc lập, reload/đổi route vẫn giữ lựa chọn, tự theo hệ thống, Esc/trả focus, storage hỏng/bị chặn, bộ chọn mobile 360 px cho 19 bảng màu × 2 chế độ và cả 8 route ở chế độ tối. Axe WCAG A/AA không phát hiện vi phạm trong các trường hợp này. Kiểm thử dùng API mock cho nội dung trang; theme đã được thử riêng trên dev server thật dù backend chưa chạy.
- [x] **M3-13** Playwright E2E spec FR-01…FR-09 trong `frontend/e2e/` (`baseURL` `http://localhost:3000`)
  - In: CONTEXT §C4, §A8 · Out: `e2e/*.spec.ts`, `playwright.config.ts` · Dep: M3-06…M3-11 · Verify: `npx playwright test --list` liệt kê spec cho từng FR (chạy thật ở M4-04)
  - Bằng chứng: (lịch sử M0–M3) frontend/playwright.config.ts + e2e/{fixtures.ts,workflows.spec.ts}; baseURL http://localhost:3000, không mock backend trong e2e/. `npm --prefix frontend run test:e2e -- --list` →.

---

## M4 — Full-Stack Integration & Verification


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
- [ ] **M4-07** DEFERRED (CR-005)
  - In: §A6.9, SEQ-03/08/09 · Out: bảng kết quả + `mc ls` · Dep: M4-02 · Verify: hành vi khớp §A6.9
  - Bằng chứng: —
- [ ] **M4-08** DEFERRED (CR-005)
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

| CR | Thay đổi | Trạng thái |
|---|---|---|
| CR-000 | Design baseline v1.0 | APPROVED |
| CR-001 | Local storage dùng SeaweedFS 4.48 | APPROVED |
| CR-002 | Prisma generate, storage:init, npm allowScripts | APPROVED |
| CR-003 | Prisma reset chỉ DB test, cần consent khi bị chặn | APPROVED |
| CR-004 | run.bat cho Windows có/không Docker | APPROVED |
| CR-005 | Hoãn M4-07 và M4-08 | APPROVED (owner 2026-10-23) |
| CR-006 | Một bảng màu, sáng/tối theo hệ thống | APPROVED (owner 2026-10-23) |
| CR-007 | DB ↔ storage best-effort, bỏ guard/worker/concurrency | APPROVED (owner 2026-10-23) |
| CR-008 | Rút gọn tài liệu cho nhóm người phát triển | APPROVED (owner 2026-10-23) |

## Lỗi tồn đọng

Mức độ: `CRITICAL` (vi phạm BR/bảo mật/mất dữ liệu) · `MAJOR` (FR không đạt) · `MINOR`.

| Bug ID | Phát hiện ở | Mô tả | Tham chiếu | Mức độ | Phụ trách | Trạng thái |
|---|---|---|---|---|---|---|
| BUG-001 | M4-04 | E2E-03 locator heading khớp h1 và h2; thêm exact: true | FR-06 | MINOR | Nhóm | FIXED; E2E 6/6 và 3/3 bổ sung đạt |
| ENV-001 | M4-01 | DEBUG=release từ môi trường agent làm SeaweedFS không lên; README chỉ cách bỏ DEBUG | Local launcher | MINOR | Nhóm | WORKAROUND DOCUMENTED |
| SEC-001 | M4-09 | Vitest 3/tinypool có 2 advisory CRITICAL; owner duyệt nâng Vitest 5.0.5 (2026-10-23) | Dependency test | CRITICAL | Nhóm | FIXED; Vitest 5.0.5, backend lint + 66 unit test PASS; audit 0 CRITICAL |
| SEC-002 | M4-09 | Prisma CLI → deepmerge-ts advisory HIGH; npm audit đề nghị Prisma major 7 | Dependency CLI | MAJOR | Nhóm | OPEN; cần kế hoạch nâng major riêng |
| TEST-001 | M4-09 | Route focus RAF có thể giành focus input/dialog khi render chậm; bỏ focus nếu đang tương tác | Frontend unit | MINOR | Nhóm | FIXED; root CI 66 backend + 61 frontend tests PASS |

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
