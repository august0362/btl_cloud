# MILESTONES — Kế hoạch, tiến độ và nghiệm thu

> Tài liệu 3/3 của Design Baseline v1.0: **CÔNG VIỆC, TIẾN ĐỘ, KIỂM CHỨNG, NGHIỆM THU**. Yêu cầu: [CONTEXT.md](CONTEXT.md). Thiết kế: [ARCHITECTURE.md](ARCHITECTURE.md).
>
> `BASELINE_VERSION: 1.0` · `OWNER_APPROVED_M0: YES` — owner đã phê duyệt ở [OWNER DESIGN APPROVAL](#owner-design-approval); thay đổi sau đó ghi ở Nhật ký thay đổi baseline.

## Quy tắc và milestone

Dùng nhánh feature/*, fix/*, chore/*. PR cần CI job `ci-required` và code owner review. Chỉ tick task sau khi đã kiểm chứng, kèm một dòng bằng chứng. Các ô [OWNER] và FINAL OWNER ACCEPTANCE do owner tự nghiệm thu.

| Milestone | Phạm vi | Trạng thái |
|---|---|---|
| M0 | Thiết kế | Owner đã duyệt |
| M1–M2 | Backend, DB, storage | Đã triển khai; xác minh lại ở M4 |
| M3 | Frontend | Đã ghép lịch sử |
| M4 | Local prototype | M4-01…06/09…11 đã kiểm; 07/08 hoãn; chờ owner gate |
| M5 | Chuẩn bị AWS | Chưa làm |

## M0 — Requirements, Architecture & UX/UI Design

Các mục dưới đây đã hoàn thành theo bằng chứng M0. Hồ sơ thiết kế chi tiết nằm trong CONTEXT và ARCHITECTURE; phần phê duyệt của owner giữ riêng ở cuối bảng.

| Mục | Trạng thái | Đầu ra và cách đối chiếu |
|---|---|---|
| **M0-01** | [x] | Đối chiếu đề xuất/hướng dẫn với CONTEXT §C0, §C6.5. |
| **M0-02** | [x] | Chốt FR, AC, BR, NFR và phạm vi tại CONTEXT §C1–C7; phân biệt yêu cầu bắt buộc và mục tiêu đề xuất. |
| **M0-03** | [x] | Đủ 12 use case, actor, input, luồng chính/lỗi, API và Page ở ARCHITECTURE §A2. |
| **M0-04** | [x] | Stack, module và phụ thuộc ở §A1/§A3; một modular monolith. |
| **M0-05** | [x] | Schema và vòng đời storage ở §A4/§A6; cập nhật CR-007 về ba bảng và best-effort. |
| **M0-06** | [x] | Cookie, phiên, CSRF, phân quyền và bảo mật ở §A5. |
| **M0-07** | [x] | Contract API-01…14, DTO, validate và lỗi ở §A7. |
| **M0-08** | [x] | Route, component, trạng thái và đặc tả P-01…08 ở §A8. |
| **M0-09** | [x] | Sơ đồ module và SEQ-01…09; từng kiểm bằng parser Mermaid 11.4.1. |
| **M0-10** | [x] | Ánh xạ local/AWS, cấu hình và điểm chưa chốt ở §A10; chưa tạo tài nguyên AWS. |
| **M0-11** | [x] | Đã kiểm tra ID, anchor, tham chiếu và schema giữa ba tài liệu. |
| **M0-12** | [x] | Chuẩn bị baseline 1.0 và danh sách OD để owner review. |

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

## M1 — Backend Foundation

Bằng chứng lịch sử dùng MySQL 8.4.7 + SeaweedFS 4.48 portable, cấu hình theo `docker/`. Docker Compose đã viết nhưng chưa nghiệm thu trên máy owner; hai mục chưa hoàn thành giữ nguyên trạng thái.

| Mục | Trạng thái | Đầu ra / kiểm chứng |
|---|---|---|
| **M1-00** | [ ] | **[OWNER] Docker Desktop/WSL2:** kiểm `docker compose version` và `docker run --rm hello-world`. |
| **M1-01** | [x] | Backend TS strict, Express, ESLint, Vitest; script build/lint/test chạy được. Phiên bản ghim trong package/lockfile. |
| **M1-02** | [x] | Root không dependency; `scripts/run-all.mjs` chạy tác vụ cho BE/FE; có lockfile và gitignore. |
| **M1-03** | [ ] | **Compose thật chưa kiểm:** chạy `docker compose up -d --wait`, init bucket dev/test, xác minh DB test và từ chối truy cập object ẩn danh. |
| **M1-04** | [x] | `config/env.ts`, `.env.example`; config test kiểm thiếu DATABASE_URL, giá trị mặc định và parse boolean/number. |
| **M1-05** | [x] | Prisma schema/migration: PK/FK, unique/index, collation utf8mb4_0900_ai_ci; migration sau CR-007 còn ba bảng. |
| **M1-06** | [x] | Prisma factory và ObjectStorage adapter; integration kiểm put/get/delete/idempotent delete/health và lỗi bucket. |
| **M1-07** | [x] | App/middleware/lifecycle: envelope lỗi, requestId, redact, CSP, JSON limit, timeout và graceful shutdown. |
| **M1-08** | [x] | API-01/02: liveness không gọi DB/storage; readiness trả 503 kèm dependency lỗi. |
| **M1-09** | [x] | Phục vụ SPA khi SERVE_FRONTEND=true; reload route, cache asset và API 404 được kiểm bằng app test, sau đó M4-02. |
| **M1-10** | [x] | Tách unit/integration; fixtures thật/giả/rỗng/UTF-8 và biên 50 MiB; reset chỉ DB test theo CR-003. |
| **M1-11** | [x] | Chạy các bước tương đương CI trên clone sạch. Integration/E2E vẫn chạy riêng; sửa CI để thêm integration là OD-08. |

## M2 — Backend Authentication & Documents

Các mục đều đã triển khai; test nghiệp vụ ở `backend/test/unit/` và `backend/test/integration/`, được chạy lại trong M4.

| Mục | Trạng thái | Đầu ra / kiểm chứng |
|---|---|---|
| **M2-01** | [x] | Argon2id, token/hash phiên, repositories; DB không chứa mật khẩu rõ, token 32 byte và hash SHA-256. |
| **M2-02** | [x] | csrfGuard: thiếu/sai header hoặc Origin lạ → 403; GET không cần CSRF. |
| **M2-03** | [x] | sessionLoader/requireAuth/cookie: cookie lạ/hết hạn bị xoá, route cần đăng nhập trả 401. |
| **M2-04** | [x] | API-03…06 và rate limit: email trùng, sai thông tin, xoay phiên, logout, 429; phiên dùng chung giữa hai app trong integration. |
| **M2-05** | [x] | Policy/loader: Guest/non-owner/owner × Public/Private; từ chối quyền trước khi nhận file. |
| **M2-06** | [x] | Upload/inspector/key/disposition: ba loại hợp lệ, giả đuôi, ZIP giả, rỗng, UTF-8, 50 MiB và +1 byte. |
| **M2-07** | [x] | API-10 ghi object → INSERT DB; lỗi storage/DB và thiếu visibility không tạo tài liệu; có bù trừ best-effort. |
| **M2-08** | [x] | API-07/08: tìm kiếm, lọc, phân trang, LIKE escape; không lộ Private, xử lý %, _ và ! theo nghĩa đen. |
| **M2-09** | [x] | API-09/13: quyền xem/tải, checksum, tên/header, lỗi object mất và storage không sẵn sàng. |
| **M2-10** | [x] | API-11: PATCH chỉ cập nhật trường gửi, đổi visibility có hiệu lực ngay, không đổi storage_key/fileVersion. |
| **M2-11** | [x] | API-12: key mới, fileVersion +1, giữ metadata/visibility; lỗi trước UPDATE giữ tệp cũ; last-write-wins. |
| **M2-12** | [x] | API-14: DELETE metadata rồi xoá object; storage lỗi vẫn 204, có log storage.orphan. |
| **M2-13** | [x] | Dọn tệp tạm và phiên hết hạn lúc khởi động; không worker hay bảng cleanup. |
| **M2-14** | [x] | Log requestId/userId/instanceId, sự kiện storage/download/server; redact mật khẩu/cookie/token. |
| **M2-15** | [x] | Contract test đi hết vòng đời và kiểm schema strict của 14 endpoint, details/requestId trong lỗi. |

## M3 — Frontend Foundation & Screens

M3-01 giữ trạng thái chưa tick như hồ sơ gốc, dù phần ứng dụng đã được kiểm lại ở M4. Các ghi nhận theme cũ được thay bằng quyết định CR-006: một bảng màu, sáng/tối theo hệ thống.

| Mục | Trạng thái | Đầu ra / kiểm chứng |
|---|---|---|
| **M3-01** | [ ] | Vite/React/TS, proxy và scripts đã viết; mục nền tảng này còn thiếu xác nhận riêng từ root trong hồ sơ M3. |
| **M3-02** | [x] | Token/CSS/layout, đủ tám route, title/lang/header theo phiên, focus khi đổi trang. |
| **M3-03** | [x] | Component dùng chung, form label/error, radio chưa chọn, dialog focus Huỷ; theo §A8.5. |
| **M3-04** | [x] | API client mở data/204, giữ details/requestId; cookie cùng origin, CSRF, lỗi mạng/huỷ và XHR tiến độ. |
| **M3-05** | [x] | AuthProvider/guards/safeRedirect/useDownload: nạp phiên, 401, logout, redirect an toàn và xử lý race điều hướng. |
| **M3-06** | [x] | Đăng ký/đăng nhập: validate, không trim mật khẩu, chuẩn hoá email, confirmPassword chỉ client, chặn gửi trùng. |
| **M3-07** | [x] | Khám phá: bộ lọc từ URL, chuẩn hoá query, 12 mục/trang, trạng thái rỗng/lỗi và phân trang. |
| **M3-08** | [x] | Chi tiết/tải xuống: metadata, action theo owner, 404/retry, xác nhận xoá và xử lý hết phiên. |
| **M3-09** | [x] | Kho cá nhân: lọc visibility, bảng/thẻ responsive, xoá sau server xác nhận; lùi trang khi xoá dòng cuối. |
| **M3-10** | [x] | Upload: loại/kích thước, visibility tường minh, tự điền tiêu đề, tiến độ/huỷ; giữ form khi lỗi. |
| **M3-11** | [x] | Chỉnh sửa/thay/xoá theo CR-007: bỏ CONFLICT UI, kiểm bằng frontend test và E2E M4. |
| **M3-12** | [x] | Responsive/accessibility: UI suite 7 ca, nhiều viewport, axe và bàn phím trên API mock. |
| **M3-13** | [x] | Spec Playwright FR-01…09, baseURL :3000; E2E thật không mock backend, kết quả ở M4. |

## M4 — Full-Stack Integration & Verification

- [x] **M4-01** Ghép M1–M3 và chạy dev
  - Bằng chứng: run.bat exit 0; health/ready 200; Chromium :5173 đăng ký → upload → My documents → Explore PASS.

- [x] **M4-02** Production-like cùng origin
  - Bằng chứng: Build BE/FE PASS; process SERVE_FRONTEND=true; contract-flows.spec.ts: SPA reload, asset immutable, CSRF writes PASS.

- [x] **M4-03** Tương thích API F-01…F-18
  - Bằng chứng: Contract API-01…14 trong 74 integration tests; client tests trong 61 frontend tests; bảng F-xx bên dưới.

- [x] **M4-04** E2E FR-01…FR-09
  - Bằng chứng: playwright install chromium exit 0; test:e2e 9/9 PASS trên :3000, không mock backend; bảng FR bên dưới.

- [x] **M4-05** Ma trận phân quyền Guest/A/B
  - Bằng chứng: node scripts/verify/authz-matrix.mjs → 82/82 PASS; bao phủ mọi ô CONTEXT §C3.2.

- [x] **M4-06** Ma trận upload/download
  - Bằng chứng: node scripts/verify/upload-matrix.mjs → 42/42 PASS; PDF/DOCX/PPTX, 50 MiB/+1, fake/empty/UTF-8, SHA-256.

- [ ] **M4-07** Lỗi storage thực khi dừng dịch vụ
  - Bằng chứng: DEFERRED (CR-005); không tick.

- [ ] **M4-08** Nhiều instance
  - Bằng chứng: DEFERRED (CR-005); không tick.

- [x] **M4-09** Kiểm tra tự động
  - Bằng chứng: Lượt cuối Node 24.19.0, Vitest 5.0.5: root CI exit 0, integration 74, frontend 61, E2E 9 PASS; bảng lệnh bên dưới.

- [x] **M4-10** Sổ lỗi và sửa lỗi
  - Bằng chứng: BUG-001/TEST-001/SEC-001 đã sửa; không còn CRITICAL mở; SEC-002 advisory HIGH Prisma CLI còn mở.

- [x] **M4-11** README và clone sạch
  - Bằng chứng: Clone local ở C:	mptl-clone, run.bat, đăng ký/đăng xuất/đăng nhập :5173 PASS; stop xong; xoá clone BLOCKED bởi policy công cụ.

- [ ] **M4-12** [OWNER] Diễn tập demo local (phần 2–5 phút trong kịch bản S2)
  - In: kịch bản demo S2 · Out: nhận xét · Dep: M4-11 · Verify: đăng nhập → tải lên → tìm kiếm → kiểm tra Public/Private
  - Bằng chứng: —
- [ ] **M4-G** [OWNER] Gate M4: xác nhận local full-stack đạt để sang M5
  - In: bằng chứng M4 · Out: quyết định · Dep: M4-10, M4-12 · Verify: owner ghi "ĐỒNG Ý" hoặc danh sách cần sửa
  - Bằng chứng: —

### M4 — Lệnh → kết quả (2026-10-23, Windows, Node 24.19.0)

| Lệnh | Kết quả lượt cuối |
|---|---|
| npm ci && npm run lint && npm run build && npm test (gốc repo) | PASS, exit 0; 66 backend + 61 frontend tests |
| npm --prefix backend run test:integration | PASS, exit 0; 74 tests, Vitest 5.0.5, DB btl_cloud_test |
| npm --prefix frontend test | PASS, exit 0; 61 tests |
| npm --prefix frontend run test:e2e | PASS, exit 0; 9 tests, Chromium headless, :3000 |
| node scripts/verify/authz-matrix.mjs | PASS; 82 checks |
| node scripts/verify/upload-matrix.mjs | PASS; 42 checks |
| npm --prefix backend audit | 0 CRITICAL; 3 HIGH packages cùng chuỗi Prisma CLI → deepmerge-ts (SEC-002) |
| npm --prefix frontend audit | 0 vulnerabilities |
| npm --prefix frontend run test:ui | PASS; 7 tests, 8 route × 360/768/1280, axe và bàn phím (mock API, không tính E2E) |

Các lượt setup lỗi không tính PASS: thiếu S3 trước khi infra sẵn sàng; npm ci gặp DLL lock khi app/test đang chạy (đã dừng process, cài và chạy lại tuần tự); E2E-03 selector đã sửa BUG-001. Không có Prisma reset bị chặn ở các lượt integration này; chỉ DB test bị reset, không reset DB dev.

### M4-03 — F-01…F-18 với backend thật

| F | Bằng chứng PASS |
|---|---|
| F-01 | Nạp phiên/reload: E2E-01 + M4-02 |
| F-02 | Register: E2E-01 và các fixture register |
| F-03 | Login: E2E-01/02 |
| F-04 | Logout: E2E-01, test phiên bị thu hồi |
| F-05 | Explore/search: E2E-02; lọc/sort/page API qua documents-search.integration |
| F-06 | Chi tiết Public/Private: E2E-03/05 |
| F-07 | Download/preflight/SHA-256: E2E-02 |
| F-08 | Guest → login redirect → download: E2E-02 |
| F-09 | My documents/reload: E2E-01; lọc/kho riêng API qua documents-search.integration |
| F-10 | Upload PDF: E2E-01; DOCX/PPTX qua upload matrix |
| F-11 | Huỷ upload và replace trên kết nối được làm chậm, không mock: contract-flows |
| F-12 | Nạp form: E2E-04 |
| F-13 | Lưu metadata: E2E-04 |
| F-14 | Private → Public + dialog: E2E-04 |
| F-15 | Replace, version tăng, visibility giữ nguyên: E2E-04/06 |
| F-16 | Cancel/delete/404: E2E-05 |
| F-17 | Thu hồi session thật rồi write → 401, toast và login redirect: contract-flows |
| F-18 | Hiện mật khẩu, menu mobile, chọn tệp, radio chưa chọn, dialog/URL: contract-flows + workflows |

### M4-04 — Ánh xạ FR

| FR | E2E và kiểm chứng |
|---|---|
| FR-01 | E2E-01: register/login/logout, HttpOnly, không token localStorage |
| FR-02 | E2E-02/03: tìm Public, ẩn Private; integration search kiểm pagination, ký tự %, dấu tiếng Việt |
| FR-03 | E2E-02/03: Guest 401, Private người khác 404, download UTF-8/SHA-256 |
| FR-04 | E2E-01/06 + upload matrix: 3 loại, 50 MiB/+1, giả/rỗng, không tài liệu ma |
| FR-05 | E2E-01/04/06: visibility bắt buộc, private/public, đổi chế độ |
| FR-06 | E2E-01/03: kho riêng, reload, cách ly A/B |
| FR-07 | E2E-04: PATCH metadata/chế độ, giữ tệp |
| FR-08 | E2E-04/06: replace/checksum/giữ visibility; integration fault injection 503 giữ tệp cũ |
| FR-09 | E2E-05: cancel không xoá, confirm 204 rồi 404; integration delete lỗi storage vẫn 204 + log |

Đây là bằng chứng tự động, không thay FINAL OWNER ACCEPTANCE. Dừng dịch vụ storage thật/nhiều instance chưa kiểm trong M4 reduced (CR-005).

### M4 — Lịch sử tích hợp và bàn giao

- [PR #1](https://github.com/august0362/btl_cloud/pull/1) đã gộp M4 vào main; [PR #2](https://github.com/august0362/btl_cloud/pull/2) đã gộp launcher, đăng nhập developer và tài liệu bàn giao. Bản main dùng để rà soát tài liệu: `31e51a7`.
- Bằng chứng CI lịch sử của M4 tại `5922964`: [ci-required PASS](https://github.com/august0362/btl_cloud/actions/runs/39898331031). Các số trong bảng M4 phía trên thuộc lượt 2026-10-23.
- Bản launcher/developer sau đó đã kiểm local: 67 backend unit, 80 frontend unit, 27 launcher/controller tests và 5 ca trình duyệt; lint/build và kiểm 50 artifact production qua.
- Clone sạch đã chạy bằng portable services. Docker thật, dừng storage thật và demo nhiều instance vẫn cần nghiệm thu theo các mục chưa tick.

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
| ENV-002 | M4-09 | Windows khoá Prisma DLL nếu npm ci chạy cùng backend/test; README yêu cầu dừng trước khi cài | Local verification | MINOR | Nhóm | WORKAROUND DOCUMENTED |
| ENV-001 | M4-01 | DEBUG=release từ môi trường agent làm SeaweedFS không lên; README chỉ cách bỏ DEBUG | Local launcher | MINOR | Nhóm | WORKAROUND DOCUMENTED |
| SEC-001 | M4-09 | Vitest 3/tinypool có 2 advisory CRITICAL; owner duyệt nâng Vitest 5.0.5 (2026-10-23) | Dependency test | CRITICAL | Nhóm | FIXED; Vitest 5.0.5, backend lint + 66 unit test PASS; audit 0 CRITICAL |
| SEC-002 | M4-09 | Prisma CLI → deepmerge-ts advisory HIGH; npm audit đề nghị Prisma major 7 | Dependency CLI | MAJOR | Nhóm | OPEN; cần kế hoạch nâng major riêng |
| TEST-001 | M4-09 | Route focus RAF có thể giành focus input/dialog khi render chậm; bỏ focus nếu đang tương tác | Frontend unit | MINOR | Nhóm | FIXED; root CI 66 backend + 61 frontend tests PASS |

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
  - Làm: `docker compose exec mysql mysql -ubtl -pbtl_dev_password btl_cloud -e "SHOW CREATE TABLE users; SHOW CREATE TABLE sessions; SHOW CREATE TABLE documents;"` (với `run.bat`: chạy cùng câu lệnh bằng `%LOCALAPPDATA%\btl-cloud-services\mysql-8.4.7-winx64\bin\mysql.exe -h127.0.0.1 -ubtl -pbtl_dev_password btl_cloud -e "…"`) → Mong đợi: PK, FK (CASCADE/RESTRICT), UNIQUE, index, kiểu cột, nullability đúng; `visibility` không có mặc định
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
  - Làm: `docker compose stop seaweedfs` (portable chưa có nút dừng riêng storage; dùng Docker cho ca dừng storage thật) → thử tải lên → `docker compose start seaweedfs` (với `run.bat`: chạy lại `run.bat`) → xem P-01, P-05 và liệt kê `documents/` trong bucket bằng S3 client trỏ `http://localhost:9000` (vd. `aws --endpoint-url http://localhost:9000 s3 ls s3://btl-cloud-documents/documents/ --recursive`, key `minioadmin`/`minioadmin-dev`) → Mong đợi: upload báo lỗi; không có tài liệu mới; object mới được xoá best-effort; lỗi xoá có WARN storage.orphan; có thể còn object mồ côi theo CR-007
  - Bằng chứng agent: —
- [ ] **ACC-10** Thay thế an toàn · FR-08, BR-07, ARCHITECTURE §A6.6
  - Làm: (1) thay tệp một tài liệu Public rồi tải xuống; (2) `docker compose stop seaweedfs` (portable chưa có nút dừng riêng storage; dùng Docker cho ca dừng storage thật) → thử thay → `docker compose start seaweedfs` (với `run.bat`: chạy lại `run.bat`) → tải xuống; (3) sau (1) liệt kê `documents/` trong bucket bằng S3 client trỏ `http://localhost:9000` (vd. `aws --endpoint-url http://localhost:9000 s3 ls s3://btl-cloud-documents/documents/ --recursive`, key `minioadmin`/`minioadmin-dev`) → Mong đợi: (1) nội dung mới, nhãn vẫn "Công khai"; (2) báo lỗi, vẫn ra tệp **cũ**; (3) chỉ còn object mới
  - Bằng chứng agent: —
- [ ] **ACC-11** Xoá vĩnh viễn · FR-09, BR-08, ARCHITECTURE §A6.7, SEQ-09
  - Làm: (1) xoá một tài liệu, mở lại link chi tiết và URL tải; (2) `docker compose stop seaweedfs` (portable chưa có nút dừng riêng storage; dùng Docker cho ca dừng storage thật) → xoá tài liệu khác → `docker compose start seaweedfs` (với `run.bat`: chạy lại `run.bat`) → liệt kê `documents/` trong bucket bằng S3 client trỏ `http://localhost:9000` (vd. `aws --endpoint-url http://localhost:9000 s3 ls s3://btl-cloud-documents/documents/ --recursive`, key `minioadmin`/`minioadmin-dev`) → Mong đợi: (1) 404 ở mọi nơi, object mất; (2) xoá báo thành công, nếu DeleteObject lỗi thì object có thể còn và log storage.orphan cho phép tra cứu (CR-007)
  - Bằng chứng agent: —
- [ ] **ACC-12** Frontend dễ dùng · ARCHITECTURE §A8, NFR-USA-01/02
  - Làm: chạy toàn bộ luồng trên desktop và giả lập 360 px; một lần tải lên chỉ dùng bàn phím; xem trạng thái rỗng (tài khoản mới) và lỗi (dừng backend) → Mong đợi: nhãn tiếng Việt nhất quán, không cuộn ngang, có tiến độ upload, lỗi dễ hiểu
  - Bằng chứng agent: —
- [ ] **ACC-13** Kiểm thử và tái lập · ARCHITECTURE §A10.6; M4-09, M4-11
  - Làm: ở clone mới, làm theo README; chạy `npm ci && npm run lint && npm run build && npm test`, `npm --prefix backend run test:integration`, `npm --prefix frontend run test:e2e` → Mong đợi: không cần bước ngoài README; mọi lệnh thoát 0
  - Bằng chứng agent: —
- [ ] **ACC-14** Demo local nhiều instance · NFR-SCL-01, ARCHITECTURE §A10.5; M4-08
  - Làm: chạy 2 backend production-like (`:3000`, `:3002`); đăng nhập ở `:3000` rồi mở "Tài liệu của tôi" ở `:3002`; gọi `/api/health` ở hai cổng; diễn lại đăng ký → tải lên → tìm → tải xuống → sửa → thay → xoá → Mong đợi: phiên dùng được ở cả hai; `instanceId` khác nhau; kịch bản chạy trơn tru
  - Bằng chứng agent: —
- [ ] **ACC-15** Sẵn sàng AWS · ARCHITECTURE §A10.7–A10.10; M5
  - Làm: review M5-01…M5-10; xác nhận OD-05/06/07/09 đã quyết; xem dự toán mới; `git grep -nE "AKIA|aws_secret_access_key"` → Mong đợi: kế hoạch đủ 8 hạng mục bắt buộc (S5); chi phí có nguồn; không có access key trong repo
  - Bằng chứng agent: —
