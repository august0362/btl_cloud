# ARCHITECTURE — Hệ thống Lưu trữ và Chia sẻ Tài liệu Học tập

> Tài liệu 2/3 của Design Baseline v1.0: **CÁCH XÂY DỰNG** và **hợp đồng kỹ thuật**. Yêu cầu: [CONTEXT.md](CONTEXT.md). Task và nghiệm thu: [MILESTONES.md](MILESTONES.md).
>
> **§A7 là nguồn sự thật duy nhất** cho giao tiếp frontend–backend. Không agent nào được tự thêm/đổi field, mã lỗi hay hành vi; mọi thay đổi ghi vào Nhật ký thay đổi baseline (MILESTONES) và chờ owner duyệt.
>
> **Cách xem sơ đồ:** khối ` ```mermaid ` là sơ đồ viết bằng mã [Mermaid](https://mermaid.js.org/). GitHub tự vẽ thành hình; trong VS Code cần extension **Markdown Preview Mermaid Support** (`bierner.markdown-mermaid`) rồi bấm `Ctrl+Shift+V`. Mọi sơ đồ đã được kiểm tra bằng parser Mermaid 11.
>
> `BASELINE_VERSION: 1.0` · `CONTRACT_STATUS: APPROVED` · `OWNER_APPROVAL: APPROVED` (MILESTONES › OWNER DESIGN APPROVAL) · cập nhật theo CR-001…CR-008

**Mục lục:** [A1 Quyết định](#a1-quyết-định-kiến-trúc) · [A2 Use Case](#a2-ngữ-cảnh-và-use-case) · [A3 Kiến trúc ứng dụng](#a3-kiến-trúc-ứng-dụng) · [A4 Cơ sở dữ liệu](#a4-cơ-sở-dữ-liệu) · [A5 Xác thực, phân quyền](#a5-xác-thực-và-phân-quyền) · [A6 Storage, vòng đời](#a6-object-storage-và-vòng-đời-tài-liệu) · [A7 API Contract](#a7-rest-api-contract) · [A8 Frontend UX/UI](#a8-frontend-uxui) · [A9 Sơ đồ tuần tự](#a9-sơ-đồ-tuần-tự) · [A10 Local và AWS](#a10-local-và-aws) · [A11 Kiểm tra nhất quán](#a11-kiểm-tra-nhất-quán)

## A1. Quyết định kiến trúc

### A1.1 Technology stack

Giữ nguyên stack owner ưu tiên; chỉ thêm thư viện nhỏ khi có lý do. Phiên bản chính xác được ghim trong `package-lock.json` ở M1/M3.

| Tầng | Lựa chọn | Lý do |
|---|---|---|
| Frontend | React + TypeScript + Vite; React Router (`react-router`, chế độ thư viện) | SPA đơn giản, build tĩnh để backend phục vụ cùng origin |
| Giao diện | CSS thuần + design token (§A8.4) + CSS Modules | Không thêm UI library; CSP chặt |
| Backend | Node.js **24 LTS** + TypeScript + **Express 5** | Express 5 tự chuyển lỗi async tới error middleware; Node 24 trùng máy dev và `lts/*` của CI (OD-13) |
| Validation | `zod` | Một schema vừa validate vừa sinh type |
| ORM | Prisma ORM + Prisma Migrate | Ưu tiên của owner; migration có version |
| Database | MySQL **8.4** (local `mysql:8.4`; AWS RDS 8.4) | Cùng major, collation mặc định `utf8mb4_0900_ai_ci` |
| Object storage | AWS SDK v3 (`client-s3`, `lib-storage`), **một adapter** cho SeaweedFS (local) và S3 | Local → AWS chỉ đổi cấu hình |
| Upload / kiểm tệp | `multer` (disk storage), `yauzl` (đọc entry ZIP) | Không đệm 50 MB trong RAM; phân biệt DOCX/PPTX thật |
| Bảo mật | `argon2` (argon2id), `helmet`, `cookie-parser`, `express-rate-limit` (bộ nhớ, theo instance) | |
| Log | `pino` + `pino-http` (JSON ra stdout) | Dễ gửi lên CloudWatch |
| Test | Vitest + Supertest; Vitest + React Testing Library; Playwright (E2E) | Ưu tiên của owner |
| Local | Docker Compose: `mysql`, `seaweedfs` (CR-001); hoặc `run.bat` chạy MySQL/SeaweedFS portable (CR-004); bucket tạo bằng `storage:init` | Tái lập được cho cả nhóm (OD-14) |

**Không dùng:** microservices, Kubernetes, Redis, Elasticsearch, queue, JWT, CORS, presigned URL, UI/state library, package code dùng chung FE–BE.

### A1.2 Quyết định thiết kế

| ID | Quyết định | Lý do · đánh đổi |
|---|---|---|
| D-01 | **Modular monolith**: một process Node phục vụ API + SPA | 4 người hiểu hết; ASG chỉ một loại instance |
| D-02 | **Cùng origin**: production Express phục vụ `frontend/dist`; dev dùng Vite proxy `/api` | Cookie SameSite hoạt động tự nhiên, không cần CORS; FE luôn gọi `/api/...` tương đối |
| D-03 | **Phiên opaque lưu DB + cookie HttpOnly** | Thu hồi ngay khi đăng xuất; instance stateless · mỗi request tốn 1 truy vấn PK |
| D-04 | **CSRF** = SameSite=Lax + header bắt buộc `X-CSRF-Protection: 1` + allowlist `Origin` | Không cần endpoint cấp token; custom header không gửi cross-origin được khi không có CORS |
| D-05 | **Upload/download đi qua backend**: tệp tạm trên đĩa (EBS) → kiểm tra → S3; download stream qua backend; bucket private | Một điểm kiểm quyền và kiểm nội dung · băng thông đi qua EC2 (chấp nhận được ở quy mô demo) |
| D-06 | **Object key bất biến** mỗi phiên bản tệp: `documents/{documentId}/{objectId}.{ext}` | Thay tệp không ghi đè tệp cũ; key không chứa dữ liệu người dùng |
| D-07 | **Bù trừ best-effort** sau lỗi DB; mọi lần xoá object thất bại ghi WARN `storage.orphan` cùng `storageKey` | DB và storage không có transaction chung; chấp nhận object mồ côi |
| D-08 | **Last write wins** khi thay tệp; `file_version` chỉ là bộ đếm hiển thị, tăng 1 bằng SQL | Không khoá lạc quan, không 409 cho tài liệu |
| D-09 | Thử xoá object cũ **ngay sau UPDATE** thành công | Không có thời gian ân hạn |
| D-10 | **Không worker định kỳ**; khởi động dọn `UPLOAD_TMP_DIR` và xoá phiên hết hạn | Request vẫn kiểm tra hạn phiên; object lỗi cần xử lý thủ công |
| D-11 | ID UUID v4 dạng `CHAR(36)` | Không đoán được; sinh trước khi INSERT |
| D-12 | Tìm kiếm `LIKE '%q%'` trên `title`/`description`, collation `utf8mb4_0900_ai_ci` | Đủ cho quy mô demo · quét bảng; nâng lên FULLTEXT khi cần |
| D-13 | Phân trang offset (`page`, `pageSize`) | Đơn giản, UI có số trang |
| D-14 | Tách **liveness** `/api/health` (không phụ thuộc gì) và **readiness** `/api/health/ready` | ALB/ASG không thay máy hàng loạt khi RDS/S3 lỗi |
| D-15 | Không package dùng chung FE–BE; type viết tay theo §A7 + contract test | Hai agent làm độc lập trên hai nhánh |
| D-16 | Root `package.json` không dependency; `backend/`, `frontend/` có lockfile riêng | Tránh xung đột lockfile; tương thích `ci.yml` hiện có |
| D-17 | Cấu hình qua biến môi trường, validate bằng zod khi khởi động | Cùng artifact chạy local và AWS |
| D-18 | Log JSON ra stdout | Chuẩn cho mọi cách thu log |

### A1.3 Cấu trúc thư mục và người phụ trách

```text
/
├── README.md                       runbook ngắn (INTEGRATION, M4)
├── package.json, package-lock.json root: không dependency; scripts → scripts/run-all.mjs
├── run.bat                         launcher Windows: MySQL + SeaweedFS portable, cài đặt, migrate, chạy app (CR-004)
├── scripts/run-all.mjs             npm ci / npm run <script> --if-present trong backend/, frontend/ nếu tồn tại
├── scripts/verify/                 authz-matrix.mjs, upload-matrix.mjs, client.mjs (kiểm chứng trên :3000)
├── docker-compose.yml, docker/mysql/init/01-init.sql, docker/seaweedfs/s3.json
├── docs/                           CONTEXT.md, ARCHITECTURE.md, MILESTONES.md, PROJECT_OVERVIEW.md, PR_M4.md
├── backend/
│   ├── package.json, package-lock.json, tsconfig.json, eslint.config.js, vitest.config.ts, .env.example
│   ├── prisma/schema.prisma, prisma/migrations/
│   ├── scripts/init-storage.ts     `npm run storage:init`: tạo bucket dev + test (chỉ local)
│   ├── src/
│   │   ├── server.ts               load config → createApp → startup cleanup → listen → graceful shutdown
│   │   ├── app.ts                  createApp(deps) — dùng trực tiếp trong Supertest
│   │   ├── container.ts            dựng dependency (Prisma, storage, repository, service)
│   │   ├── lifecycle.ts            graceful shutdown
│   │   ├── config/env.ts
│   │   ├── http/                   errors.ts, validate.ts, static.ts, middleware/
│   │   ├── modules/                health/, auth/, users/, documents/, files/   (chi tiết §A3.2)
│   │   ├── storage/                object-storage.ts, s3-object-storage.ts, in-memory-object-storage.ts
│   │   ├── cleanup/                tmp-sweeper.ts
│   │   ├── db/prisma.ts
│   │   └── lib/                    logger.ts, clock.ts, ids.ts
│   └── test/                       unit/ (npm test), integration/ (npm run test:integration), helpers/
└── frontend/
    ├── package.json, package-lock.json, vite.config.ts, tsconfig.json, eslint.config.js, index.html
    ├── src/                        main.tsx, App.tsx, api/, auth/, components/, pages/, hooks/, lib/, styles/
    ├── e2e/                        Playwright E2E trên stack thật :3000 (`test:e2e`)
    └── ui-tests/                   Playwright với API mock (`test:ui`)
```

```mermaid
flowchart LR
  root(["Repo BTL_Cloud"])
  root --> docs["docs/<br/>CONTEXT, ARCHITECTURE, MILESTONES"]
  root --> be["backend/<br/>REST API, phục vụ SPA"]
  root --> fe["frontend/<br/>React SPA, Playwright e2e"]
  root --> infra["docker-compose.yml, docker/<br/>MySQL + SeaweedFS cho local"]
  root --> tooling["package.json, scripts/<br/>lint, build, test cho cả hai package"]
  root --> gh[".github/<br/>CODEOWNERS, CI"]
  docs -.- o1(["CLAUDE_DESIGN"])
  be -.- o2(["CLAUDE_BACKEND"])
  infra -.- o2
  tooling -.- o2
  fe -.- o3(["CODEX_FRONTEND"])
  gh -.- o4(["OWNER"])
  classDef owner fill:#FEF3C7,stroke:#B45309,color:#78350F
  class o1,o2,o3,o4 owner
```

`docs/` chỉ đổi qua Nhật ký thay đổi baseline sau khi owner duyệt. `docker-compose.yml`, `docker/`, root `package.json`, `scripts/` do CLAUDE_BACKEND tạo ở M1; thay đổi sau đó do INTEGRATION điều phối. `README.md` thuộc INTEGRATION. `.github/` được CODEOWNERS bảo vệ; agent chỉ được đề xuất qua PR.

### A1.4 Quy tắc phụ thuộc

```mermaid
flowchart LR
  R["routes / controllers"] --> S["services + policy + FileInspector"]
  S --> P["repositories"]
  S --> O["ObjectStorage interface"]
  P --> PR["PrismaClient"]
  O --> SDK["AWS SDK v3"]
  FP["FE pages"] --> FC["FE components"]
  FP --> FA["FE api"]
  FP --> FH["FE hooks"]
  FH --> FA
```

- Service **không** import Express; controller **không** gọi Prisma/AWS SDK. Chỉ repository dùng `PrismaClient`; chỉ `storage/s3-object-storage.ts` import `@aws-sdk/*`. `config` và `lib/logger` dùng được ở mọi tầng.
- Mọi quyết định phân quyền tài liệu nằm trong `document.policy.ts` (RK-02).
- Frontend: `components` không gọi `api` (nhận dữ liệu/callback qua props); chỉ `api/*` được gọi `fetch`/`XMLHttpRequest`. Không có mũi tên ngược; khuyến nghị lint rule `no-restricted-imports`.

## A2. Ngữ cảnh và Use Case

### A2.1 Sơ đồ ngữ cảnh

```mermaid
flowchart LR
  guest["Guest<br/>trình duyệt"]
  user["User<br/>trình duyệt"]
  subgraph sys["Hệ thống Lưu trữ và Chia sẻ Tài liệu"]
    app["Ứng dụng web<br/>React SPA + REST API"]
    db[("MySQL / RDS<br/>users, sessions, documents")]
    obj[("Object storage<br/>SeaweedFS / S3 private")]
  end
  ops["Nhóm vận hành<br/>log, health, CloudWatch"]
  guest -->|"tìm kiếm, xem metadata Public"| app
  user -->|"đăng nhập, upload, download, quản lý"| app
  app -->|"SQL qua Prisma"| db
  app -->|"S3 API"| obj
  ops -.->|"giám sát"| app
```

### A2.2 Sơ đồ Use Case

```mermaid
flowchart LR
  guest["«actor»<br/>Guest"]
  user["«actor»<br/>User"]
  owner["«actor»<br/>Owner<br/>User sở hữu tài liệu"]
  subgraph S["Hệ thống"]
    UC01(["UC-01 Đăng ký"])
    UC02(["UC-02 Đăng nhập"])
    UC03(["UC-03 Đăng xuất"])
    UC04(["UC-04 Tìm kiếm, duyệt tài liệu Public"])
    UC05(["UC-05 Xem chi tiết tài liệu"])
    UC06(["UC-06 Tải xuống tài liệu"])
    UC07(["UC-07 Tải lên tài liệu"])
    UC08(["UC-08 Xem kho cá nhân"])
    UC09(["UC-09 Sửa metadata"])
    UC10(["UC-10 Đổi chế độ hiển thị"])
    UC11(["UC-11 Thay thế tệp"])
    UC12(["UC-12 Xoá vĩnh viễn"])
  end
  guest --- UC01 & UC02 & UC04 & UC05
  user --- UC03 & UC04 & UC05 & UC06 & UC07 & UC08
  owner --- UC09 & UC10 & UC11 & UC12
  owner -.->|"là một"| user
  UC06 -.->|"«include» kiểm tra phiên + quyền xem"| UC05
  UC10 -.->|"«extend»"| UC09
```

### A2.3 Tác nhân → cơ chế thực thi

Ma trận quyền nghiệp vụ: CONTEXT §C3.2.

| Tác nhân | Nhận diện | Thực thi |
|---|---|---|
| Guest | `req.auth = null` sau `sessionLoader` | Chỉ vào được API-01/02/03/04/05/06/07/09; route khác bị `requireAuth` chặn (401) |
| User | `req.auth = { userId, sessionId, user }` | Dữ liệu cá nhân luôn lọc `owner_id = req.auth.userId` |
| Owner | `documents.owner_id === req.auth.userId` | `canView`/`canManage` trong `document.loader`, chạy **trước** khi đọc body (§A5.5) |

### A2.4 Mô tả Use Case

Giữ actor, dữ liệu vào, luồng chính, kết quả và lỗi quan trọng ở đây; chi tiết payload ở §A7, trạng thái màn hình ở §A8 và luồng tuần tự ở §A9.

**UC-01 Đăng ký** · Guest · FR-01 · API-04 · P-03 · SEQ-01
- Gửi `displayName, email, password`; confirmPassword chỉ kiểm tại FE. Sau CSRF/rate limit/schema: chuẩn hoá email → băm mật khẩu → transaction INSERT users + sessions → 201 UserDto/cookie → vào kho cá nhân.
- Lỗi: 400 theo trường, 409 EMAIL_ALREADY_EXISTS tại Email, 429, 500. Thành công tự đăng nhập.

**UC-02 Đăng nhập** · Guest · FR-01 · API-05 · P-02 · SEQ-01
- Tài khoản đã có; gửi email/password và redirect nếu cần. Verify Argon2id → xoá phiên cũ trên trình duyệt → tạo phiên mới → 200/cookie → redirect an toàn hoặc kho cá nhân.
- Email/mật khẩu sai dùng chung INVALID_CREDENTIALS (401); quá giới hạn 429. Phiên mới mặc định 7 ngày.

**UC-03 Đăng xuất** · User · FR-01 · API-06 · AppHeader · SEQ-01
- Xoá phiên theo hash cookie → 204 + xoá cookie → FE đặt Guest, về trang chủ. Endpoint idempotent, không bắt buộc phiên hợp lệ.
- Cookie cũ vô hiệu trên mọi instance; lỗi mạng thì FE vẫn bỏ trạng thái đăng nhập, phiên server tự hết hạn theo TTL.

**UC-04 Tìm kiếm Public** · Guest/User · FR-02 · API-07 · P-01 · SEQ-04
- Mở trang hoặc gửi q/fileType/sort/page từ URL → query chỉ PUBLIC → Page<DocumentDto>, lưới thẻ và phân trang.
- URL sai được FE chuẩn hoá; lỗi server/mạng có Thử lại; rỗng có EmptyState. Không thay đổi dữ liệu.

**UC-05 Xem chi tiết** · Guest/User/Owner · FR-02, FR-06 · API-09 · P-04, P-07
- Mở `/documents/:id` → Public trả cho mọi người, Private chỉ owner → metadata và hành động theo isOwner.
- Không tồn tại/Private của người khác trả 404 DOCUMENT_NOT_FOUND. Không thay đổi dữ liệu.

**UC-06 Tải xuống** · User có quyền xem · FR-03 · API-03 + API-13 · P-01, P-04, P-05 · SEQ-05
- Bấm Tải xuống → FE kiểm phiên qua API-03 → điều hướng link tải → backend requireAuth + canView → GetObject và stream attachment, đúng tên/nội dung tệp.
- Hết phiên chuyển tới login kèm redirect; 401/404 giữa hai bước có thể hiện JSON. Storage lỗi trước header trả 503, sau header ngắt kết nối.

**UC-07 Tải lên** · User · FR-04, FR-05 · API-10 · P-06 · SEQ-02, SEQ-03
- Gửi file/title/description?/visibility bằng XHR có tiến độ. CSRF/auth → tệp tạm → validate/FileInspector → PutObject → INSERT documents → 201, fileVersion=1 → kho cá nhân; Public xuất hiện trong tìm kiếm.
- Sai input/loại/kích thước: 400/415/413; storage 503; DB 500; cho phép huỷ. Lỗi trước INSERT không tạo metadata, tệp tạm được dọn và object mới được thử xoá khi cần bù trừ.

**UC-08 Kho cá nhân** · User · FR-06 · API-08 · P-05
- RequireAuth; q/visibility/fileType/sort/page từ URL → lọc owner_id=userId → Page<DocumentDto> gồm Public/Private của mình, kèm hành động quản lý.
- 401 xử lý hết phiên; rỗng có lời mời tải lên. Không thay đổi dữ liệu.

**UC-09 Sửa metadata** · Owner · FR-07 · API-11 · P-07
- Gửi title?/description? đã đổi → CSRF/auth/canManage → validate → UPDATE → 200 DocumentDto mới. updated_at đổi; tệp và fileVersion giữ nguyên.
- Lỗi: 400 theo trường, 401, 403/404. Không gửi trường chưa đổi.

**UC-10 Đổi chế độ** · Owner · FR-07 · API-11 · P-07
- Gửi visibility đã đổi; Private → Public phải xác nhận CD-03. Đổi chế độ có hiệu lực ngay với tìm kiếm/xem/tải.
- Huỷ dialog không gọi API; lỗi như UC-09. Chuyển Private làm tài liệu biến mất khỏi tìm kiếm và user khác nhận 404.

**UC-11 Thay tệp** · Owner · FR-08 · API-12 · P-07 · SEQ-07, SEQ-08
- Chọn file, xác nhận CD-02 → PutObject key mới → UPDATE file fields, tăng fileVersion → thử xoá key cũ → 200. Giữ id/title/description/visibility.
- 400/413/415, 503, 404 nếu bị xoá đồng thời, 500. Lỗi trước UPDATE giữ tham chiếu cũ; object thừa được thử xoá theo best-effort.

**UC-12 Xoá vĩnh viễn** · Owner · FR-09 · API-14 · P-04, P-05, P-07 · SEQ-09
- Xác nhận CD-01 → DELETE metadata theo id → thử xoá object của dòng vừa xoá → 204; tài liệu mất khỏi danh sách và các endpoint trả 404.
- 401/403/404 theo quyền; xoá object lỗi vẫn 204, ghi WARN storage.orphan để xử lý thủ công.

## A3. Kiến trúc ứng dụng

### A3.1 Sơ đồ container

```mermaid
flowchart LR
  browser["Trình duyệt<br/>React SPA"]
  subgraph app["Backend process: Node.js 24 + Express 5, chạy N instance"]
    spa["Static SPA<br/>frontend/dist"]
    apiC["REST API /api/*"]
  end
  db[("MySQL<br/>users, sessions, documents")]
  obj[("Object storage S3 / SeaweedFS<br/>documents/...")]
  tmp[("Đĩa tạm cục bộ<br/>UPLOAD_TMP_DIR")]
  browser -->|"GET /, /assets/*"| spa
  browser -->|"fetch JSON, XHR multipart, download"| apiC
  apiC --> db
  apiC --> obj
  apiC --> tmp
```

### A3.2 Module backend

```mermaid
flowchart TB
  subgraph http["Tầng HTTP: Express"]
    mw["middleware<br/>requestId, logger, helmet, json, csrfGuard,<br/>sessionLoader, requireAuth, rateLimit, errorHandler"]
    routes["routes + controllers<br/>health, auth, documents"]
    loader["document.loader<br/>nạp tài liệu + kiểm quyền"]
    upload["upload.middleware<br/>multer disk storage"]
    static["static SPA<br/>SERVE_FRONTEND"]
  end
  subgraph svc["Tầng service"]
    authS["AuthService"]
    docS["DocumentService"]
    policy["DocumentPolicy"]
    inspector["FileInspector"]
  end
  subgraph data["Tầng truy cập dữ liệu"]
    userR["UserRepository"]
    sessR["SessionRepository"]
    docR["DocumentRepository"]
    storage["ObjectStorage<br/>interface"]
  end
  subgraph infra["Hạ tầng"]
    prisma["PrismaClient"]
    s3impl["S3ObjectStorage<br/>AWS SDK v3"]
  end
  mw --> authS
  routes --> authS
  routes --> docS
  loader --> docR
  loader --> policy
  upload --> inspector
  docS --> policy
  docS --> docR
  docS --> storage
  inspector -.->|"InspectedFile"| docS
  authS --> userR
  authS --> sessR
  userR --> prisma
  sessR --> prisma
  docR --> prisma
  storage -.->|"hiện thực bởi"| s3impl
```

#### A3.2.1 Module `auth` (+ `users`)

```mermaid
flowchart LR
  req(["POST /api/auth/register, login, logout<br/>GET /api/auth/me"])
  subgraph mw["Middleware chung"]
    csrf["csrfGuard<br/>chỉ với POST"]
    sess["sessionLoader<br/>đọc cookie → req.auth"]
    rl["authRateLimit<br/>register, login"]
  end
  subgraph authmod["modules/auth"]
    aroutes["auth.routes.ts"]
    actrl["auth.controller.ts<br/>đọc body, gọi service, đặt / xoá cookie"]
    aschema["auth.schemas.ts<br/>zod: email, password, displayName"]
    asvc["auth.service.ts<br/>register, login, logout, resolveSession"]
    pw["password.ts<br/>argon2id hash, verify"]
    srepo["session.repository.ts<br/>create, findValid, delete, deleteExpired"]
    scookie["session.cookie.ts<br/>tên cookie, HttpOnly, Secure, SameSite, Max-Age"]
  end
  subgraph usersmod["modules/users"]
    urepo["user.repository.ts<br/>findByEmail, create"]
    umap["user.mapper.ts<br/>row → UserDto"]
  end
  db[("MySQL<br/>users, sessions")]
  req --> csrf --> sess --> rl --> aroutes --> actrl
  actrl --> aschema
  actrl --> asvc
  actrl --> scookie
  asvc --> pw
  asvc --> srepo
  asvc --> urepo
  asvc --> umap
  sess -.->|"resolveSession"| asvc
  srepo --> db
  urepo --> db
```

#### A3.2.2 Module `documents` + `files`

Số trên mũi tên là thứ tự xử lý trong một request.

```mermaid
flowchart LR
  req(["/api/documents/*"])
  subgraph mw["Middleware chung"]
    csrf["csrfGuard"]
    sess["sessionLoader"]
    rauth["requireAuth<br/>route cần đăng nhập"]
  end
  subgraph docmod["modules/documents"]
    droutes["documents.routes.ts<br/>/mine đăng ký trước /:id"]
    loader["document.loader.ts<br/>nạp theo :id, áp policy"]
    policy["document.policy.ts<br/>canView, canManage"]
    dctrl["documents.controller.ts"]
    dschema["documents.schemas.ts<br/>zod: query, PATCH body, field multipart"]
    dsvc["documents.service.ts<br/>search, list, get, create, update,<br/>replace, delete, openDownload"]
    drepo["document.repository.ts"]
    dmap["document.mapper.ts<br/>row + viewer → DocumentDto"]
  end
  subgraph filesmod["modules/files"]
    upl["upload.middleware.ts<br/>multer → UPLOAD_TMP_DIR, ≤ 50 MB"]
    insp["file-inspector.ts<br/>chữ ký PDF, entry OOXML, làm sạch tên"]
    keys["storage-keys.ts<br/>documents/docId/objId.ext"]
    cdisp["content-disposition.ts<br/>filename + filename*"]
  end
  storage["ObjectStorage"]
  db[("MySQL")]
  s3[("S3 / SeaweedFS")]
  req -->|"1"| csrf -->|"2"| sess -->|"3"| droutes
  droutes -->|"4"| rauth
  droutes -->|"5"| loader
  loader --> policy
  loader --> drepo
  droutes -->|"6 chỉ API-10, API-12"| upl
  upl --> insp
  droutes -->|"7"| dctrl
  dctrl --> dschema
  dctrl --> dsvc
  dctrl --> cdisp
  insp -.->|"InspectedFile"| dsvc
  dsvc --> drepo
  dsvc --> dmap
  dsvc --> keys
  dsvc --> storage
  drepo --> db
  storage --> s3
```

#### A3.2.3 Module `storage` và dọn lúc khởi động

`DocumentService` gọi `ObjectStorage` (put/get/delete). `S3ObjectStorage` là adapter S3-compatible; `InMemoryObjectStorage` dùng trong unit test. `cleanup/tmp-sweeper.ts` xoá tệp tạm theo request và dọn thư mục khi server khởi động. Server gọi `SessionRepository.deleteExpired` theo lô lúc khởi động; không có worker định kỳ.

```mermaid
flowchart LR
  doc["DocumentService"] --> iface["ObjectStorage"]
  iface --> s3["S3ObjectStorage"]
  iface --> mem["InMemoryObjectStorage"]
  startup["server startup"] --> tmp["Dọn UPLOAD_TMP_DIR"]
  startup --> sessions["Xoá phiên hết hạn"]
```

#### A3.2.4 Interface và hàm chính (class diagram)

Mỗi hộp là một module; `+tên(tham số) KiểuTrảVề` là hàm public; `Promise~X~` nghĩa là `Promise<X>`. Tên hàm là đề xuất: CLAUDE_BACKEND được đổi tên nội bộ, nhưng không được đổi hành vi.

```mermaid
classDiagram
  direction LR
  class AuthService {
    +register(input) Promise~AuthResult~
    +login(input, previousToken) Promise~AuthResult~
    +logout(token) Promise~void~
    +resolveSession(token) Promise~AuthContext~
  }
  class DocumentService {
    +searchPublic(query, viewer) Promise~Page~
    +listMine(userId, query) Promise~Page~
    +getForViewer(id, viewer) Promise~DocumentDto~
    +create(ownerId, metadata, file) Promise~DocumentDto~
    +updateMetadata(id, userId, patch) Promise~DocumentDto~
    +replaceFile(id, userId, file) Promise~DocumentDto~
    +delete(id, userId) Promise~void~
    +openDownload(id, viewer) Promise~DownloadStream~
  }
  class DocumentPolicy {
    +canView(doc, viewer) Decision
    +canManage(doc, viewer) Decision
  }
  class FileInspector {
    +inspect(tmpPath, originalName, sizeBytes) Promise~InspectedFile~
  }
  class ObjectStorage {
    <<interface>>
    +putObject(key, filePath, contentType, sizeBytes) Promise~void~
    +getObject(key) Promise~StoredObject~
    +deleteObject(key) Promise~void~
    +checkHealth() Promise~void~
  }
  class S3ObjectStorage
  class InMemoryObjectStorage
  class AuthContext {
    +userId string
    +sessionId string
    +user UserDto
  }
  class InspectedFile {
    +fileType FileType
    +mimeType string
    +extension string
    +sanitizedFilename string
    +sizeBytes number
    +tmpPath string
  }
  class Decision {
    <<enumeration>>
    ALLOW
    NOT_FOUND
    FORBIDDEN
  }
  ObjectStorage <|.. S3ObjectStorage
  ObjectStorage <|.. InMemoryObjectStorage
  DocumentService --> DocumentPolicy
  DocumentService --> ObjectStorage
  DocumentService ..> InspectedFile : nhận từ FileInspector
  FileInspector ..> InspectedFile : trả về
  AuthService ..> AuthContext : tạo
  DocumentPolicy ..> Decision : trả về
```

Repository (chỉ tầng này dùng Prisma). `updateFile` trả số dòng bị ảnh hưởng; 0 dòng nghĩa là tài liệu đã bị xoá (404).

```mermaid
classDiagram
  direction LR
  class UserRepository {
    +findByEmail(email) Promise~User~
    +findById(id) Promise~User~
    +create(tx, data) Promise~User~
  }
  class SessionRepository {
    +create(tx, idHash, userId, expiresAt) Promise~void~
    +findWithUser(idHash) Promise~SessionWithUser~
    +delete(idHash) Promise~void~
    +deleteExpired(limit) Promise~number~
  }
  class DocumentRepository {
    +findById(id) Promise~DocumentRow~
    +search(filter, page, pageSize, sort) Promise~RowsAndTotal~
    +insert(row) Promise~void~
    +updateMetadata(id, patch) Promise~DocumentRow~
    +updateFile(id, file) Promise~number~
    +delete(id) Promise~DocumentRow~
  }
  class PrismaClient {
    <<external>>
  }
  UserRepository --> PrismaClient
  SessionRepository --> PrismaClient
  DocumentRepository --> PrismaClient
```

### A3.3 Frontend

```mermaid
flowchart TB
  main["main.tsx → App.tsx<br/>BrowserRouter + routes"]
  providers["AuthProvider, ToastProvider"]
  layout["AppLayout<br/>AppHeader, main, AppFooter"]
  guards["RequireAuth, GuestOnly"]
  pages["pages/*<br/>P-01 … P-08"]
  comps["components/*<br/>UI dùng chung"]
  hooks["hooks/*<br/>useAuth, useToast, useDocumentList"]
  lib["lib/*<br/>format, validation, errorMessages, safeRedirect"]
  api["api/*<br/>client.ts, upload.ts, auth.ts, documents.ts, types.ts"]
  backend[("Backend /api")]
  main --> providers --> layout --> guards --> pages
  pages --> comps
  pages --> hooks
  pages --> lib
  hooks --> api
  pages --> api
  providers --> api
  api --> backend
```

#### A3.3.1 Cây ứng dụng và route

```mermaid
flowchart TB
  main["main.tsx"] --> app["App.tsx"]
  app --> router["BrowserRouter"]
  router --> toast["ToastProvider"]
  toast --> auth["AuthProvider<br/>user, status"]
  auth --> layout["AppLayout"]
  layout --> skip["SkipLink"]
  layout --> header["AppHeader<br/>nav theo trạng thái đăng nhập"]
  layout --> routes["Routes trong thẻ main"]
  layout --> footer["AppFooter"]
  routes --> r01["/ → HomePage · P-01"]
  routes --> r04["/documents/:id → DocumentDetailPage · P-04"]
  routes --> guest["GuestOnly"]
  guest --> r02["/login → LoginPage · P-02"]
  guest --> r03["/register → RegisterPage · P-03"]
  routes --> req["RequireAuth"]
  req --> r05["/me/documents → MyDocumentsPage · P-05"]
  req --> r06["/upload → UploadPage · P-06"]
  req --> r07["/documents/:id/edit → EditDocumentPage · P-07"]
  routes --> r08["* → NotFoundPage · P-08"]
  classDef guard fill:#E0E7FF,stroke:#3730A3,color:#1E1B4B
  class guest,req guard
```

#### A3.3.2 Module `api` và `auth` (class diagram)

```mermaid
classDiagram
  direction LR
  class client {
    <<module>>
    +request(method, path, options) Promise~T~
  }
  class upload {
    <<module>>
    +uploadMultipart(method, path, formData, options) Promise~T~
  }
  class authApi {
    <<module>>
    +me() Promise~MeData~
    +register(body) Promise~UserData~
    +login(body) Promise~UserData~
    +logout() Promise~void~
  }
  class documentsApi {
    <<module>>
    +searchPublic(params) Promise~Page~
    +listMine(params) Promise~Page~
    +get(id) Promise~DocumentDto~
    +upload(input, options) Promise~DocumentDto~
    +update(id, patch) Promise~DocumentDto~
    +replaceFile(id, file, options) Promise~DocumentDto~
    +remove(id) Promise~void~
    +downloadUrl(id) string
  }
  class ApiError {
    +status number
    +code string
    +message string
    +details ValidationIssue[]
    +requestId string
  }
  class AuthProvider {
    +user UserDto
    +status string
    +login(body) Promise~void~
    +register(body) Promise~void~
    +logout() Promise~void~
    +refresh() Promise~void~
    +markSignedOut() void
  }
  authApi --> client
  documentsApi --> client
  documentsApi --> upload
  AuthProvider --> authApi
  client ..> ApiError : ném khi lỗi
  upload ..> ApiError : ném khi lỗi
```

### A3.4 Runtime local

```mermaid
flowchart LR
  subgraph devbox["Máy dev: Windows 11"]
    browser["Trình duyệt<br/>http://localhost:5173"]
    vite["Vite dev server :5173<br/>proxy /api"]
    be["Backend :3000<br/>tuỳ chọn instance thứ 2 :3002"]
    tmp[("backend/tmp/uploads")]
    subgraph compose["Docker Compose hoặc run.bat (portable)"]
      mysql[("MySQL 8.4 :3306<br/>btl_cloud, btl_cloud_test")]
      weed[("SeaweedFS 4.48 S3 API :9000<br/>btl-cloud-documents, -test")]
    end
    init["npm run storage:init<br/>tạo bucket rồi thoát"]
  end
  browser --> vite
  vite -->|"/api/*"| be
  browser -.->|"chế độ production-like<br/>http://localhost:3000"| be
  be --> mysql
  be --> weed
  be --> tmp
  init --> weed
```

### A3.5 Ánh xạ triển khai AWS (mục tiêu, chưa provisioning)

```mermaid
flowchart TB
  users["Người dùng Internet"]
  subgraph vpc["VPC trải 2 AZ"]
    subgraph pubA["Public Subnet A"]
      albA["ALB node A"]
    end
    subgraph pubB["Public Subnet B"]
      albB["ALB node B"]
    end
    subgraph privA["Private Subnet A"]
      ec2A["EC2 app + EBS gp3<br/>thuộc ASG"]
      rds[("RDS MySQL 8.4<br/>Single-AZ")]
    end
    subgraph privB["Private Subnet B"]
      ec2B["EC2 app + EBS gp3<br/>thuộc ASG"]
    end
    s3ep["S3 Gateway Endpoint"]
  end
  s3[("S3 bucket private<br/>documents/...")]
  cw["CloudWatch<br/>metrics, alarms, logs theo OD-06"]
  iam["IAM Role + Instance Profile"]
  users -->|"HTTP hoặc HTTPS theo OD-05"| albA
  users --> albB
  albA -->|"HTTP :3000"| ec2A
  albA --> ec2B
  albB --> ec2A
  albB --> ec2B
  ec2A -->|"TCP 3306"| rds
  ec2B --> rds
  ec2A --> s3ep
  ec2B --> s3ep
  s3ep --> s3
  ec2A -.-> cw
  ec2B -.-> cw
  iam -.->|"credentials tạm thời"| ec2A
  iam -.-> ec2B
```

ASG tối thiểu 2 / mong muốn 2 / tối đa 4 instance (theo S3) trên 2 private subnet. Chi tiết: §A10.8–A10.10.

### A3.6 Đặc tả module

**Backend** (Owner: CLAUDE_BACKEND). Hàm cụ thể xem §A3.2.4.

| Module | Trách nhiệm | Input → Output | Phụ thuộc | Lỗi |
|---|---|---|---|---|
| `config/env` | Parse, validate biến môi trường (§A10.2) | `process.env` → `Config` bất biến | zod | Thiếu/sai → log tên biến, `exit(1)` |
| `http/middleware` | requestId, logger, helmet, JSON 16 KB, cookie, `csrfGuard`, `sessionLoader`, `requireAuth`, `authRateLimit`, `notFound` (thứ tự §A3.8) | request → `req.id`, `req.auth` | config, AuthService | 403 `CSRF_REJECTED`, 401, 429, 404 `ROUTE_NOT_FOUND` |
| `http/errorHandler` | Map mọi lỗi sang envelope §A7.2; xoá tệp tạm còn sót; lỗi lạ → 500 + log stack (không trả stack cho client) | Error → JSON | logger | — |
| `http/validate` + `*.schemas.ts` | Schema zod theo §A7.5 | `req` → DTO đã validate | zod | 400 `VALIDATION_ERROR` + `details` |
| `modules/health` | API-01, API-02 | — → JSON | Prisma ping, ObjectStorage | 503 `SERVICE_UNAVAILABLE` (API-02) |
| `modules/auth`, `modules/users` | Đăng ký, đăng nhập, đăng xuất, nạp phiên; băm mật khẩu; cookie | DTO, token → `UserDto`, `AuthContext` | repositories, argon2 | `EMAIL_ALREADY_EXISTS`, `INVALID_CREDENTIALS` |
| `documents/document.policy` | `canView`, `canManage` (hàm thuần, §A5.5) | doc, viewer → `Decision` | — | — |
| `documents/document.loader` | Nạp tài liệu theo `:id`, áp policy **trước khi đọc body** | `:id`, `req.auth` → `res.locals.document` | DocumentRepository, policy | 404/403; route multipart thì xả body |
| `documents` (service) | Tìm, liệt kê, xem, tạo, sửa, thay, xoá, mở download; transaction và giao thức storage (§A6) | DTO, `InspectedFile` → `DocumentDto`, `Page`, stream | DocumentRepository, ObjectStorage | `STORAGE_UNAVAILABLE`, `DOCUMENT_NOT_FOUND` |
| `files/upload.middleware` | multer: đúng 1 tệp vào `UPLOAD_TMP_DIR`, giới hạn §A7.1, tên tệp UTF-8 | multipart → `req.file`, `req.body` | multer | 413 `FILE_TOO_LARGE`, 400 |
| `files/file-inspector` | Xác định loại theo đuôi + chữ ký (§A6.4); làm sạch tên | tệp tạm → `InspectedFile` | fs, yauzl | 415, 400 `EMPTY_FILE` |
| `storage` | `putObject`, `getObject`, `deleteObject` (idempotent), `checkHealth` | key, tệp → void / stream | AWS SDK v3 (chỉ `S3ObjectStorage`) | `StorageError { UNAVAILABLE \| NOT_FOUND }` |
| `lib/logger` | Log JSON pino, redact bí mật (§A5.8) | sự kiện → stdout | pino | — |
| `http/static` | Phục vụ SPA khi `SERVE_FRONTEND=true` (§A3.7) | GET không thuộc `/api` → file | express.static | Thiếu dist → cảnh báo, chỉ phục vụ API |

**Frontend** (Owner: CODEX_FRONTEND). Hàm cụ thể xem §A3.3.2.

| Module | Trách nhiệm | Input → Output | Phụ thuộc | Lỗi |
|---|---|---|---|---|
| `App.tsx` | Khai báo route §A8.2, bọc guard | URL → trang | react-router | Route lạ → P-08 |
| `api/client.ts` | `request()`: `credentials: 'same-origin'`, gắn `X-CSRF-Protection: 1` cho POST/PUT/PATCH/DELETE, mở `{data}`, phát `auth:unauthorized` khi 401 `UNAUTHENTICATED` | tham số → `T` | fetch | `ApiError`; lỗi mạng → `NETWORK_ERROR` |
| `api/upload.ts` | `uploadMultipart()` bằng XHR, có `onProgress`, huỷ bằng `signal` | FormData → `T` | XMLHttpRequest | `ApiError`; huỷ → `ABORTED` |
| `api/auth.ts`, `api/documents.ts`, `api/types.ts` | Hàm có type cho từng endpoint (§A8.12); type khớp §A7.4 | DTO → DTO | client, upload | Lan truyền `ApiError` |
| `auth/*` | `AuthProvider` (gọi API-03 khi khởi động, giữ `user` + `status`, **không** dùng localStorage), `RequireAuth`, `GuestOnly` | context → trang / `<Navigate>` | api/auth | 401 toàn cục → Guest + toast |
| `components/*` | UI thuần, không gọi API (§A8.5) | props → JSX | lib, styles | — |
| `pages/*` | Ghép component, gọi API qua `api/*` hoặc hook | URL, context → trang | components, hooks, api, lib | Trạng thái lỗi §A8.9 |
| `lib/*` | `validation` (§A8.8), `errorMessages` (§A8.9), `format`, `safeRedirect` | giá trị → giá trị | — | — |

### A3.7 Phục vụ SPA cùng origin

1. Artifact triển khai: `backend/dist` + `node_modules` (production) + `backend/prisma` + `frontend/dist` (base `/`).
2. Thứ tự trong Express khi `SERVE_FRONTEND=true`: router `/api/*` → `/api/*` không khớp → 404 JSON → `express.static` (`/assets/*` có hash: `Cache-Control: public, max-age=31536000, immutable`) → **SPA fallback**: GET/HEAD có `Accept: text/html` → `index.html` (`no-cache`) → còn lại 404.
3. ALB có một rule duy nhất: forward mọi đường dẫn tới target group cổng 3000. FE luôn gọi `/api/...` tương đối; **không có** `API_BASE_URL`.
4. Dev: Vite (5173) proxy `/api` → `:3000`; trình duyệt chỉ thấy origin `:5173`, nên cookie và CSRF chạy giống production.

### A3.8 Pipeline xử lý request

```mermaid
flowchart TB
  in(["Request vào một instance"]) --> rid["1 requestId"] --> rlog["2 requestLogger"] --> hel["3 helmet"] --> json["4 express.json ≤ 16 KB"] --> ck["5 cookieParser"]
  ck --> isapi{"Đường dẫn bắt đầu /api ?"}
  isapi -->|"Không"| st["10 static + SPA fallback"]
  isapi -->|"Có"| unsafe{"POST, PUT, PATCH, DELETE ?"}
  unsafe -->|"Có"| csrf["6 csrfGuard"]
  unsafe -->|"Không"| sl["7 sessionLoader"]
  csrf --> sl
  sl --> match{"8 Khớp route ?"}
  match -->|"Không"| nf["9 notFound → 404 ROUTE_NOT_FOUND"]
  match -->|"Có"| chain["8a authRateLimit → requireAuth → document.loader<br/>→ upload.middleware → validate → controller"]
  chain --> ok(["Response 2xx"])
  json -.->|"JSON lỗi / quá lớn"| eh["11 errorHandler<br/>envelope lỗi + xoá tệp tạm"]
  csrf -.->|"403"| eh
  chain -.->|"401, 403, 404, 409, 413, 415, 429, 500, 503"| eh
```

Hệ quả quan trọng: **xác thực và phân quyền chạy trước khi nhận tệp upload**. Request chưa đăng nhập hoặc không phải owner không thể khiến server ghi 50 MB xuống đĩa.

## A4. Cơ sở dữ liệu

### A4.1 MySQL và object storage

| Dữ liệu | Nơi lưu |
|---|---|
| Tài khoản (email, hash mật khẩu, tên hiển thị) | MySQL `users` |
| Phiên (hash token, thời hạn); token gốc chỉ nằm trong cookie | MySQL `sessions` |
| Metadata tài liệu (tiêu đề, mô tả, visibility, loại, MIME, tên gốc, kích thước, object key, `file_version`, thời gian). Đây là **nguồn sự thật** về sự tồn tại và quyền truy cập | MySQL `documents` |
| **Byte nội dung tệp**; object chỉ có `Content-Type`, không lưu tên/owner/visibility | Object storage, key `documents/{documentId}/{objectId}.{ext}` |
| Tệp đang upload dở (sống tối đa trong một request) | Đĩa cục bộ `UPLOAD_TMP_DIR` (EBS trên AWS) |

Quan hệ: một User có 0..n Session và 0..n Document; mỗi Document có đúng 1 owner và trỏ tới đúng 1 object hiện hành. Object không còn tham chiếu được xoá best-effort; có thể mồ côi khi lỗi.

### A4.2 ERD

```mermaid
erDiagram
  users ||--o{ sessions : "có"
  users ||--o{ documents : "sở hữu"
  users {
    char36 id PK "UUID v4"
    varchar254 email UK "chữ thường"
    varchar255 password_hash "argon2id PHC"
    varchar100 display_name
    datetime3 created_at
    datetime3 updated_at
  }
  sessions {
    char64 id PK "SHA-256 hex của token"
    char36 user_id FK
    datetime3 created_at
    datetime3 expires_at
  }
  documents {
    char36 id PK "UUID v4"
    char36 owner_id FK
    varchar200 title
    varchar2000 description "NULL được"
    enum visibility "PUBLIC, PRIVATE"
    enum file_type "PDF, DOCX, PPTX"
    varchar100 mime_type
    varchar255 original_filename
    int_unsigned size_bytes
    varchar512 storage_key UK
    int_unsigned file_version
    datetime3 created_at
    datetime3 updated_at
    datetime3 file_updated_at
  }
```

### A4.3 Đặc tả bảng

Quy ước: InnoDB; database `utf8mb4` / `utf8mb4_0900_ai_ci`; mọi `DATETIME(3)` lưu **UTC**; bảng/cột snake_case (Prisma dùng `@@map`/`@map`); UUID sinh ở ứng dụng (`crypto.randomUUID()`).

**`users`**: định danh và thông tin đăng nhập.

| Cột | Kiểu | Null | Mặc định / ràng buộc |
|---|---|---|---|
| `id` | `CHAR(36)` | NO | PK |
| `email` | `VARCHAR(254)` | NO | UNIQUE `uq_users_email` |
| `password_hash` | `VARCHAR(255)` | NO | |
| `display_name` | `VARCHAR(100)` | NO | |
| `created_at` / `updated_at` | `DATETIME(3)` | NO | `CURRENT_TIMESTAMP(3)`; `updated_at` = Prisma `@updatedAt` |

Ghi bởi API-04 (MVP không có cập nhật). Đọc bởi API-05, `sessionLoader`, JOIN lấy `display_name` ở API-07/08/09. Bất biến: `email` luôn trim + chữ thường; `password_hash` không rời backend; không API nào trả email của người khác.

**`sessions`**: phiên dùng chung giữa mọi instance.

| Cột | Kiểu | Null | Mặc định / ràng buộc |
|---|---|---|---|
| `id` | `CHAR(64)` | NO | PK (SHA-256 hex của token) |
| `user_id` | `CHAR(36)` | NO | FK → `users.id` ON DELETE CASCADE; INDEX `idx_sessions_user_id` |
| `created_at` | `DATETIME(3)` | NO | `CURRENT_TIMESTAMP(3)` |
| `expires_at` | `DATETIME(3)` | NO | INDEX `idx_sessions_expires_at` |

Tạo bởi API-04/05; xoá bởi API-06, API-05 (phiên cũ), `sessionLoader` (gặp phiên hết hạn), khởi động server. Bất biến: chỉ lưu hash; hợp lệ ⇔ `expires_at > NOW(3)`; không bao giờ gia hạn.

**`documents`**: metadata và con trỏ tới object hiện hành.

| Cột | Kiểu | Null | Mặc định / ràng buộc |
|---|---|---|---|
| `id` | `CHAR(36)` | NO | PK |
| `owner_id` | `CHAR(36)` | NO | FK → `users.id` ON DELETE RESTRICT |
| `title` | `VARCHAR(200)` | NO | 1–200 ký tự (ứng dụng kiểm) |
| `description` | `VARCHAR(2000)` | YES | `NULL` |
| `visibility` | `ENUM('PUBLIC','PRIVATE')` | NO | **không mặc định** (BR-04) |
| `file_type` | `ENUM('PDF','DOCX','PPTX')` | NO | |
| `mime_type` | `VARCHAR(100)` | NO | suy từ `file_type`, không lấy từ client |
| `original_filename` | `VARCHAR(255)` | NO | đã làm sạch (§A6.4) |
| `size_bytes` | `INT UNSIGNED` | NO | 1…52 428 800 (tuỳ chọn thêm `CHECK` bằng SQL tay) |
| `storage_key` | `VARCHAR(512)` | NO | UNIQUE `uq_documents_storage_key` |
| `file_version` | `INT UNSIGNED` | NO | `1`; +1 mỗi lần thay tệp |
| `created_at` / `updated_at` | `DATETIME(3)` | NO | `updated_at` đổi khi sửa metadata **hoặc** thay tệp |
| `file_updated_at` | `DATETIME(3)` | NO | = `created_at` lúc tạo; đổi khi thay tệp |

Index: `idx_documents_visibility_created (visibility, created_at)`, `idx_documents_owner_created (owner_id, created_at)`. INSERT bởi API-10 (**chỉ sau khi object đã có trong storage**); UPDATE bởi API-11 (metadata) và API-12 (cột tệp + `file_version`); DELETE bởi API-14.
- **INV-D1:** mọi bản ghi trỏ tới object đã ghi thành công, nên không có tài liệu dở dang (BR-06).
- **INV-D2:** `visibility` chỉ đổi qua API-11; API-12 không bao giờ ghi cột này (BR-07).
- **INV-D3:** `storage_key` có dạng `documents/{id}/{uuid}.{ext}`, `ext` khớp `file_type`.

### A4.4 Truy vấn chính và index

| Thao tác | Truy vấn | Index |
|---|---|---|
| Nạp phiên | `sessions JOIN users WHERE sessions.id = ?` | PK |
| Đăng nhập | `users WHERE email = ?` | `uq_users_email` |
| Tìm công khai | `WHERE visibility='PUBLIC' [AND (title LIKE ? OR description LIKE ?)] [AND file_type=?] ORDER BY created_at DESC, id DESC LIMIT/OFFSET` + `COUNT(*)` | `idx_documents_visibility_created` |
| Kho cá nhân | `WHERE owner_id=? [AND visibility=?] …` | `idx_documents_owner_created` |
| Xoá phiên hết hạn | `DELETE FROM sessions WHERE expires_at < NOW(3) LIMIT 1000` | `idx_sessions_expires_at` |

### A4.5 Vòng đời

`Uploading`/`Replacing` là trạng thái **tạm trong một request**, không lưu trong bảng; `documents` chỉ chứa tài liệu `Active`.

```mermaid
stateDiagram-v2
  [*] --> Uploading: API-10 hợp lệ
  Uploading --> Active: PutObject OK và COMMIT
  Uploading --> [*]: lỗi bất kỳ, không có bản ghi
  Active --> Active: API-11 sửa metadata hoặc visibility
  Active --> Replacing: API-12
  Replacing --> Active: COMMIT, file_version tăng 1
  Replacing --> Active: lỗi, giữ nguyên tệp cũ
  Active --> Deleted: API-14 COMMIT
  Deleted --> [*]
```

Vòng đời object: PutObject → được `documents` tham chiếu → thay/xoá DB → thử DeleteObject. Lỗi DB sau PutObject cũng thử DeleteObject; lỗi xoá ghi `storage.orphan`.

### A4.6 Migration

- Prisma Migrate; migration SQL commit trong `backend/prisma/migrations/`, **không sửa** sau khi đã áp dụng ở môi trường dùng chung. Migration đầu `init` được giữ nguyên; migration `20261023000000_drop_storage_cleanup_tasks` xoá bảng cleanup, còn 3 bảng như §A4.3; không có seed cho production.
- Dev: `npm --prefix backend exec -- prisma migrate dev --name <tên>` (user `btl` dev có quyền tạo shadow DB).
- Test: `prisma migrate reset --force` trên `btl_cloud_test` trong global setup; giữa các test xoá dữ liệu theo thứ tự `sessions`, `documents`, `users`.
- Production: `npm --prefix backend run prisma:deploy` (= `prisma migrate deploy`) chạy một lần trước khi rollout (Prisma có advisory lock). Migration phải tương thích ngược (expand → deploy → contract), vì ASG chạy song song phiên bản cũ và mới.
- Nếu Prisma major mới yêu cầu driver adapter cho MySQL: làm theo hướng dẫn chính thức và ghi vào bằng chứng M1-05; schema logic không đổi.

## A5. Xác thực và phân quyền

### A5.1 Mô hình và mật khẩu

- **Phiên opaque lưu DB + cookie HttpOnly** (D-03). Không JWT, không Authorization header, không token trong JS/localStorage. FE biết trạng thái đăng nhập qua API-03.
- Mật khẩu: **argon2id**, `memoryCost = 19456` KiB, `timeCost = 2`, `parallelism = 1` (mức tối thiểu OWASP, hợp với t3.micro 1 GiB); lưu chuỗi PHC; **không trim**; 8–128 ký tự khi đăng ký.
- Email không tồn tại → vẫn chạy `verify` với một hash giả tạo sẵn để thời gian phản hồi tương đương.

### A5.2 Vòng đời phiên

| Sự kiện | Hành vi |
|---|---|
| Tạo token | `crypto.randomBytes(32).toString('base64url')` (43 ký tự); DB lưu `id = SHA-256(token)` hex |
| Tạo phiên | API-04 (cùng transaction với INSERT user), API-05; `expires_at = now + SESSION_TTL_HOURS` (168 h, OD-12) |
| Xoay phiên | API-04/05 có cookie phiên (hợp lệ hay không) → DELETE phiên đó trước khi tạo phiên mới (chống session fixation) |
| Mỗi request `/api` | `sessionLoader`: không cookie → `null`; không thấy → `null` + xoá cookie; hết hạn → DELETE + xoá cookie + `null`; hợp lệ → `req.auth` |
| Hết hạn | Cố định, **không** gia hạn trượt |
| Đăng xuất | DELETE theo hash, xoá cookie, luôn 204 (idempotent); cookie cũ vô hiệu trên mọi instance |
| Dọn dẹp | Lúc khởi động (lặp theo lô tới hết): `DELETE … WHERE expires_at < NOW(3) LIMIT 1000` |

### A5.3 Cookie

| Thuộc tính | Dev (HTTP localhost) | Production có HTTPS | Production chỉ HTTP (nếu OD-05 chọn) |
|---|---|---|---|
| Tên (`SESSION_COOKIE_NAME`) | `sid` | `__Host-sid` | `sid` |
| `HttpOnly` / `SameSite` / `Path` | có / `Lax` / `/` | như dev | như dev |
| `Secure` (`COOKIE_SECURE`) | không | **có** | không (RK-04) |
| `Domain` | không đặt | không đặt (bắt buộc với `__Host-`) | không đặt |
| `Max-Age` | `SESSION_TTL_HOURS × 3600` | như dev | như dev |

```http
Set-Cookie: sid=Vh3m...q9A; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800
Set-Cookie: sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0
```

### A5.4 Chống CSRF

Áp dụng cho mọi `/api/*` có phương thức **POST, PUT, PATCH, DELETE** (kể cả API-04/05/06):
1. **Bắt buộc** header `X-CSRF-Protection: 1`; thiếu hoặc sai → 403 `CSRF_REJECTED`.
2. Có header `Origin` thì giá trị phải thuộc `ALLOWED_ORIGINS`; không khớp → 403. Không có `Origin` (curl, Supertest) → chỉ dựa vào bước 1.
3. `SameSite=Lax` là lớp phòng thủ thêm. GET (kể cả API-13) không cần header.

FE (`api/client.ts`, `api/upload.ts`) luôn gắn header cho POST/PUT/PATCH/DELETE. Không có endpoint cấp CSRF token.

### A5.5 Phân quyền phía server

```mermaid
flowchart TB
  start(["Request tới /api/documents/:id..."]) --> unsafe{"Thay đổi trạng thái ?"}
  unsafe -->|"Có"| csrf{"Có X-CSRF-Protection 1<br/>và Origin hợp lệ ?"}
  csrf -->|"Không"| e403c["403 CSRF_REJECTED"]
  csrf -->|"Có"| needauth
  unsafe -->|"Không"| needauth{"Endpoint cần đăng nhập<br/>và chưa có phiên ?"}
  needauth -->|"Đúng"| e401["401 UNAUTHENTICATED"]
  needauth -->|"Không"| load["Nạp documents theo id"]
  load --> exists{"Tồn tại ?"}
  exists -->|"Không"| e404["404 DOCUMENT_NOT_FOUND"]
  exists -->|"Có"| kind{"Loại thao tác"}
  kind -->|"Xem, tải xuống"| own1{"Là owner ?"}
  own1 -->|"Có"| allow(["ALLOW → xử lý tiếp"])
  own1 -->|"Không"| pub1{"PUBLIC ?"}
  pub1 -->|"Có"| allow
  pub1 -->|"Không"| e404
  kind -->|"Sửa, thay tệp, xoá"| own2{"Là owner ?"}
  own2 -->|"Có"| allow
  own2 -->|"Không"| pub2{"PUBLIC ?"}
  pub2 -->|"Có"| e403f["403 FORBIDDEN"]
  pub2 -->|"Không"| e404
  classDef deny fill:#FEE2E2,stroke:#B91C1C,color:#7F1D1D
  classDef ok fill:#DCFCE7,stroke:#15803D,color:#14532D
  class e403c,e401,e404,e403f deny
  class allow ok
```

| Endpoint | CSRF | `requireAuth` | Policy | Kết quả từ chối |
|---|---|---|---|---|
| API-07 | — | — | SQL `visibility='PUBLIC'` | — |
| API-08 | — | có | SQL `owner_id = viewer` | 401 |
| API-09 | — | — | `canView` | 404 |
| API-10 | có | có | — (người tải lên thành owner) | 403 `CSRF_REJECTED` / 401 |
| API-11, API-14 | có | có | `canManage` | 403 `CSRF_REJECTED` / 401 / 404 / 403 `FORBIDDEN` |
| API-12 | có | có | `canManage` **trước khi đọc body** | như API-11 |
| API-13 | — | có | `canView` | 401 / 404 |

`id` sai định dạng UUID → 404. Danh sách luôn lọc ở SQL, không lọc sau khi lấy dữ liệu. `DocumentDto.owner` chỉ có `id` + `displayName`.

### A5.6 Giới hạn tần suất

API-04, API-05: cửa sổ 15 phút, tối đa `AUTH_RATE_LIMIT_MAX` (20) request/IP **trên mỗi instance**; API-05 chỉ đếm lần thất bại. Vượt ngưỡng → 429 `RATE_LIMITED` + `Retry-After`. Sau ALB đặt `trust proxy = TRUST_PROXY` (1) để `req.ip` lấy từ `X-Forwarded-For`. Với N instance, giới hạn thực tế là N × ngưỡng (RK-10).

### A5.7 Phiên hết hạn và request không được phép

| Tình huống | Backend | Frontend |
|---|---|---|
| Guest gọi endpoint cần đăng nhập | 401 `UNAUTHENTICATED` | Tới `/login?redirect=<đường dẫn hiện tại>` |
| Cookie hết hạn / bị thu hồi gọi endpoint cần đăng nhập | Xoá cookie + 401 | `markSignedOut()`, toast "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", tới login kèm `redirect` |
| Cookie hết hạn gọi API-03 | Xoá cookie + 200 `{user: null}` | Guest, không toast |
| Cookie hết hạn gọi API-07/09 | Xoá cookie, phục vụ như Guest | Bình thường |
| Không phải owner, tài liệu Public | 403 `FORBIDDEN` | "Bạn không có quyền thực hiện thao tác này." |
| Tài liệu Private của người khác | 404 | "Không tìm thấy tài liệu hoặc bạn không có quyền xem." |
| Thiếu header CSRF / Origin lạ | 403 `CSRF_REJECTED` | Lỗi lập trình: Alert chung |

### A5.8 Cross-origin, HTTPS, header, log

- **Cross-origin:** không bật CORS, không trả header `Access-Control-*`. `ALLOWED_ORIGINS` khi dev là `http://localhost:5173,http://localhost:3000,http://localhost:3001`; trên production chốt ở M5.
- **HTTPS:** TLS kết thúc tại ALB; ALB → EC2 dùng HTTP trong VPC (chỉ SG của ALB vào được). Có HTTPS (OD-05): listener 443 + ACM, 80 redirect sang 443, `COOKIE_SECURE=true`, `__Host-sid`, `HSTS_ENABLED=true`. Chỉ HTTP: tắt `Secure`/HSTS, ghi là rủi ro được chấp nhận (RK-04); ACM không cấp chứng chỉ cho `*.elb.amazonaws.com`. **Mã nguồn không đổi**, chỉ đổi biến môi trường.
- **Header:** `helmet`, CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`; `nosniff`; `Referrer-Policy: no-referrer`; HSTS chỉ khi bật. JSON dưới `/api` có `Cache-Control: no-store`. FE không dùng inline script, không chèn `<style>`, không tải font/ảnh từ CDN.
- **Log:** pino `redact` gồm `req.headers.cookie`, `res.headers["set-cookie"]`, `req.body.password`; không log body multipart; log `userId`, không log email.

### A5.9 Xác thực công cụ developer local

Công cụ local có tài khoản riêng, không thêm role admin vào bảng users. Người quản lý máy cấp tài khoản từ gốc repo bằng `npm --prefix backend run dev:account -- ten_cua_ban`; mật khẩu ngẫu nhiên chỉ in một lần. `backend/tmp/developer-account.json` lưu username/salt/hash scrypt, được Git bỏ qua và Vite chặn phục vụ.

- Vite giữ capability của controller trên server; trình duyệt gọi `/__local/backend/*`, được chuyển vào nhóm route `/browser/*` đã kiểm phiên.
- Controller xác thực cho cả đọc trạng thái/log và start/stop/restart. Không dùng localStorage hay phiên tài khoản website để cấp quyền.
- Phiên cookie HttpOnly, SameSite=Strict, Path=/__local/backend, tối đa 8 giờ; đăng xuất/cấp lại tài khoản thu hồi phiên, controller khởi động lại yêu cầu đăng nhập lại.
- Giới hạn năm lần thử đăng nhập/phút; đăng nhập vẫn dùng được khi Express hoặc MySQL tắt.
- Launcher/CLI dùng capability từ file local để khởi động/khôi phục dịch vụ. Toàn bộ công cụ này chỉ đăng ký trong development, không đưa vào artifact production.

## A6. Object storage và vòng đời tài liệu

### A6.1 Nguyên tắc

1. Bucket **private**: không ACL công khai, không presigned URL; mọi byte đi qua backend sau khi kiểm quyền.
2. **MySQL là nguồn sự thật**: tài liệu tồn tại ⇔ có bản ghi `documents`.
3. **Ghi object trước, commit metadata sau** (INV-D1).
4. **Không ghi đè object**: mỗi phiên bản tệp có key mới (D-06).
5. Xoá object best-effort; thất bại ghi WARN `storage.orphan` kèm `storageKey`. Không hàng đợi tự thử lại.

### A6.2 Bucket và object key

| Mục | Giá trị |
|---|---|
| Bucket | `S3_BUCKET` (local `btl-cloud-documents`, test `btl-cloud-documents-test`, AWS chốt ở M5) |
| Key | `documents/{documentId}/{objectId}.{ext}`, `objectId` = UUID mới mỗi lần ghi, `ext` ∈ `pdf`, `docx`, `pptx` |
| Metadata object | Chỉ `Content-Type` do server xác định |
| Cách ghi | `lib-storage` `Upload` với `Body = fs.createReadStream(tmpPath)` (tự dùng multipart cho tệp lớn) |
| S3 (M5) | Bật đủ Block Public Access; Object Ownership = BucketOwnerEnforced; SSE-S3; **tắt versioning** (nếu bật, DeleteObject chỉ tạo delete marker, trái BR-08); lifecycle `AbortIncompleteMultipartUpload` sau 1 ngày |
| SeaweedFS (local) | Bucket do `npm --prefix backend run storage:init` tạo (`S3_BUCKET` và `S3_BUCKET-test`); truy cập cần access key trong `docker/seaweedfs/s3.json`, không có quyền ẩn danh |

### A6.3 Upload (API-10)

| Bước | Hành động | Nếu lỗi | Để lại |
|---|---|---|---|
| U1 | CSRF, session, `requireAuth` | 403 / 401 | Không có gì; body chưa được đọc |
| U2 | multer ghi đúng 1 tệp vào `UPLOAD_TMP_DIR/<uuid>`, đếm byte | > 52 428 800 → 413; > 1 tệp → 400 `TOO_MANY_FILES`; client huỷ | multer xoá tệp dở |
| U3 | Validate `title`, `description`, `visibility` | 400 | Tệp tạm bị xoá |
| U4 | FileInspector | 415 / 400 `EMPTY_FILE` | Tệp tạm bị xoá |
| U5 | Sinh documentId và immutable key; PutObject | 503 STORAGE_UNAVAILABLE | Không có documents |
| U6 | INSERT documents, file_version = 1 | Lỗi DB: thử DeleteObject(key), ném lại lỗi DB gốc | Không có documents; object có thể mồ côi |
| U7 | Xoá tệp tạm trong finally; trả 201 DocumentDto | Xoá tạm lỗi: dọn ở lần khởi động sau | Tài liệu Active |

Crash sau PutObject trước INSERT có thể để lại object không được tham chiếu.

### A6.4 FileInspector

| # | Quy tắc | Lỗi |
|---|---|---|
| 1 | `sizeBytes == 0` | 400 (`file` / `EMPTY_FILE`) |
| 2 | Đuôi (chữ thường, sau khi làm sạch tên) ∈ {`pdf`, `docx`, `pptx`} | 415 |
| 3 | PDF: 5 byte đầu là `%PDF-` | 415 |
| 4 | DOCX/PPTX: 4 byte đầu `PK\x03\x04`; đọc central directory bằng `yauzl` (không giải nén, tối đa 10 000 entry); phải có `[Content_Types].xml` **và** `word/document.xml` (DOCX) / `ppt/presentation.xml` (PPTX); ZIP hỏng → từ chối | 415 |
| 5 | `mimeType` lấy theo CN-01 từ `fileType`; **bỏ qua** `Content-Type` client gửi | — |
| 6 | Làm sạch tên: giải mã UTF-8 (busboy mặc định latin1: dùng `defParamCharset: 'utf8'` hoặc tự chuyển, RK-09) → basename → bỏ ký tự điều khiển và `"` → NFC → trim → dài quá 255 thì cắt phần tên, giữ đuôi → tên rỗng thì dùng `tai-lieu.<ext>` | — |

### A6.5 Download (API-13)

`requireAuth` → loader + `canView` → `getObject(storage_key)` → gửi header (§A7.7 API-13) → `body.pipe(res)`; client ngắt kết nối thì `body.destroy()`. Lỗi **trước** header: `UNAVAILABLE` → 503; `NOT_FOUND` → 503 + log ERROR `download.object_missing` (vi phạm INV-D1). Lỗi **sau** header: `res.destroy()` + log. Không hỗ trợ `Range`.

### A6.6 Thay thế tệp (API-12)

CSRF → auth → loader + canManage trước khi đọc body → multer + FileInspector → sinh newKey bất biến → PutObject(newKey) → UPDATE documents SET các cột tệp, file_version = file_version + 1 WHERE id = ? → thử DeleteObject(oldKey) → 200 DocumentDto. Không ghi title, description hoặc visibility.

PutObject lỗi → 503, tài liệu vẫn trỏ oldKey. UPDATE lỗi → thử xoá newKey rồi ném lại lỗi gốc; 0 dòng → thử xoá newKey, trả 404. Hai replace đồng thời đều có thể thành công; lần ghi sau thắng. Không 409, không ân hạn xoá.

### A6.7 Xoá vĩnh viễn (API-14)

CSRF → auth → canManage → DELETE documents theo id (lấy key của dòng vừa xoá) → thử DeleteObject(key) → 204. DB lỗi → giữ nguyên object; không còn dòng → 404. Object xoá thất bại vẫn trả 204 vì tài liệu đã biến mất khỏi DB.

### A6.8 Dọn dẹp lúc khởi động

Mỗi lần xoá object thất bại ghi WARN `{ event: 'storage.orphan', storageKey }`. Không bảng task, guard, retry hay worker định kỳ. Khi server khởi động: dọn các tệp còn trong UPLOAD_TMP_DIR và xoá phiên hết hạn theo lô. Tệp tạm của request được xoá trong finally; xác thực vẫn từ chối phiên hết hạn trên mỗi request.

### A6.9 Ma trận lỗi

| Điểm lỗi | documents | Object | HTTP / phục hồi |
|---|---|---|---|
| Upload PutObject lỗi | Không có | Có thể có phần dư | 503 |
| Upload INSERT lỗi | Không có | Thử xoá key mới | Ném lỗi DB gốc; xoá lỗi ghi storage.orphan |
| Crash sau PutObject | Không có | Có thể mồ côi | Kết nối đứt; xử lý thủ công |
| Replace PutObject lỗi | Trỏ key cũ | Tệp cũ giữ nguyên | 503 |
| Replace UPDATE 0 dòng | Đã bị xoá | Thử xoá key mới | 404 |
| Replace UPDATE lỗi | Không đổi bởi request này | Thử xoá key mới | Ném lại lỗi DB gốc |
| Replace xoá key cũ lỗi | Trỏ key mới | Key cũ mồ côi | 200 + WARN storage.orphan |
| Delete DB lỗi | Còn nguyên | Còn nguyên | 500 |
| Delete object lỗi | Đã xoá | Key mồ côi | 204 + WARN storage.orphan |
| Download object mất | Có | Không có | 503 + ERROR download.object_missing |

#### Accepted limitations

- Object mồ côi có thể còn lại sau lỗi; các lần xoá thất bại được thấy qua log `storage.orphan` kèm storageKey. Crash đột ngột trước bù trừ có thể không kịp ghi log.
- Thay tệp đồng thời là last-write-wins; có thể để lại key của lần thay bị ghi đè. Không lịch sử phiên bản, không cơ chế tự thu gom.

## A7. REST API Contract

> **Nguồn sự thật duy nhất**, phiên bản hợp đồng **1.0**. Backend trả đúng các trường dưới đây; frontend không giả định thêm trường nào.

### A7.1 Quy ước chung

| Chủ đề | Quy ước |
|---|---|
| Phiên bản | Contract 1.0; không đặt version trong URL vì SPA và API luôn triển khai cùng artifact. Thay đổi phá vỡ tương thích → tăng baseline, cập nhật cả hai phía trong cùng đợt merge |
| Base path | `/api`, đường dẫn tương đối, cùng origin |
| Định dạng | JSON UTF-8. Response `application/json; charset=utf-8`, trừ API-13 (nhị phân) và 204 (không body) |
| Tên trường | `camelCase`; enum viết HOA (`PUBLIC`, `PDF`), riêng `sort` viết thường (`newest`, `title`) |
| ID | UUID v4 chữ thường. `{id}` sai định dạng → 404 `DOCUMENT_NOT_FOUND` |
| Thời gian | ISO 8601 UTC có mili giây, ví dụ `"2026-10-20T08:30:00.000Z"`; FE tự đổi sang giờ địa phương |
| Null và thiếu trường | Response: mọi trường trong schema **luôn có mặt**; trường nullable mang `null`. Request: trường tuỳ chọn được bỏ qua. PATCH: bỏ qua = không đổi; `description: null` hoặc `""` = xoá mô tả |
| Trường lạ | Body JSON / multipart có trường lạ → 400 `UNKNOWN_FIELD`. Query param lạ bị bỏ qua |
| Độ dài chuỗi | Tính theo Unicode code point (`[...s].length`), khớp cách MySQL đếm `VARCHAR` |
| Header | POST/PUT/PATCH/DELETE **bắt buộc** `X-CSRF-Protection: 1`; cookie do trình duyệt tự gửi. Response luôn có `X-Request-Id`; JSON có `Cache-Control: no-store` |
| Giới hạn | JSON ≤ 16 KB (413 `PAYLOAD_TOO_LARGE`). Multipart: đúng 1 part tệp ≤ 52 428 800 byte (413 `FILE_TOO_LARGE`); tối đa 5 part văn bản, mỗi part ≤ 16 KB |
| Thứ tự route | `/api/documents/mine` đăng ký **trước** `/api/documents/:id` |

### A7.2 Envelope

Thành công (2xx, trừ 204): `{ "data": … }`. Lỗi (4xx/5xx; API-13 sau khi đã bắt đầu stream thì không gửi được JSON):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Dữ liệu gửi lên không hợp lệ.",
    "details": [ { "field": "title", "issue": "TOO_LONG", "message": "Tiêu đề tối đa 200 ký tự." } ],
    "requestId": "0b7f5d0e-2c55-4a7e-8f61-3e0f3f1a9b2c"
  }
}
```

`code`: máy đọc, FE rẽ nhánh theo trường này. `message`: tiếng Việt, dùng làm fallback. `details`: **luôn có**, `[]` khi không có chi tiết; có phần tử với `VALIDATION_ERROR` và `SERVICE_UNAVAILABLE`. `requestId`: trùng header `X-Request-Id`.

### A7.3 Mã lỗi

| `code` | HTTP | Khi nào | `message` mặc định |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Dữ liệu/tham số/tệp không hợp lệ | Dữ liệu gửi lên không hợp lệ. |
| `INVALID_JSON` | 400 | Body JSON không parse được | Dữ liệu JSON không hợp lệ. |
| `UNAUTHENTICATED` | 401 | Chưa đăng nhập, phiên hết hạn/bị thu hồi | Bạn cần đăng nhập để thực hiện thao tác này. |
| `INVALID_CREDENTIALS` | 401 | Sai email hoặc mật khẩu | Email hoặc mật khẩu không đúng. |
| `CSRF_REJECTED` | 403 | Thiếu header CSRF / `Origin` không được phép | Yêu cầu bị từ chối vì lý do bảo mật. |
| `FORBIDDEN` | 403 | Không phải owner của tài liệu Public | Bạn không có quyền thực hiện thao tác này. |
| `ROUTE_NOT_FOUND` | 404 | Đường dẫn `/api/*` không tồn tại | Không tìm thấy đường dẫn API. |
| `DOCUMENT_NOT_FOUND` | 404 | Không tồn tại, `id` sai, hoặc Private của người khác | Không tìm thấy tài liệu. |
| `EMAIL_ALREADY_EXISTS` | 409 | Đăng ký trùng email | Email đã được sử dụng. |
| `PAYLOAD_TOO_LARGE` | 413 | JSON > 16 KB / part văn bản > 16 KB | Dữ liệu gửi lên quá lớn. |
| `FILE_TOO_LARGE` | 413 | Tệp > 52 428 800 byte | Tệp vượt quá dung lượng tối đa 50 MB. |
| `UNSUPPORTED_FILE_TYPE` | 415 | Không phải PDF/DOCX/PPTX hợp lệ | Chỉ hỗ trợ tệp PDF, DOCX, PPTX. |
| `RATE_LIMITED` | 429 | Vượt giới hạn (kèm `Retry-After`) | Bạn thao tác quá nhanh. Vui lòng thử lại sau. |
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước | Đã có lỗi xảy ra. Vui lòng thử lại. |
| `STORAGE_UNAVAILABLE` | 503 | Object storage lỗi/không phản hồi | Kho lưu trữ tệp tạm thời không khả dụng. Vui lòng thử lại sau. |
| `SERVICE_UNAVAILABLE` | 503 | API-02: một thành phần phụ thuộc lỗi | Dịch vụ chưa sẵn sàng. |

Mã chỉ có ở client: `NETWORK_ERROR` (fetch/XHR thất bại, `status = 0`), `ABORTED` (người dùng huỷ upload).

`ValidationIssue.issue` ∈ `REQUIRED`, `INVALID_TYPE`, `INVALID_FORMAT`, `TOO_SHORT`, `TOO_LONG`, `OUT_OF_RANGE`, `INVALID_ENUM`, `UNKNOWN_FIELD`, `EMPTY_FILE`, `TOO_MANY_FILES`, `NO_CHANGES`, `UNAVAILABLE`. `field` là tên trường, `"body"` (lỗi cả body, ví dụ `NO_CHANGES`), hoặc tên thành phần (`database`, `storage`) với `SERVICE_UNAVAILABLE`.

**Lỗi chung, không nhắc lại ở từng endpoint:** 500 `INTERNAL_ERROR`; POST/PUT/PATCH/DELETE thêm 403 `CSRF_REJECTED`; body JSON thêm 400 `INVALID_JSON` và 413 `PAYLOAD_TOO_LARGE`.

### A7.4 Schema dùng chung

**`UserDto`** (chỉ trả cho chính người dùng): `id` string UUID · `email` string (chữ thường) · `displayName` string · `createdAt` string ISO. **`OwnerDto`**: `{ id, displayName }`, không bao giờ có email.

**`DocumentDto`**

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | string UUID | |
| `title` | string | |
| `description` | string \| **null** | `null` khi không có mô tả |
| `visibility` | `"PUBLIC" \| "PRIVATE"` | |
| `fileType` | `"PDF" \| "DOCX" \| "PPTX"` | |
| `originalFilename` | string | Tên đã làm sạch, dùng khi tải xuống |
| `sizeBytes` | integer | 1…52 428 800 |
| `fileVersion` | integer | Từ 1, tăng khi thay tệp |
| `owner` | `OwnerDto` | |
| `isOwner` | boolean | `true` khi người gọi là owner; Guest luôn `false` |
| `createdAt` / `updatedAt` / `fileUpdatedAt` | string ISO | `updatedAt` đổi khi sửa metadata hoặc thay tệp; `fileUpdatedAt` chỉ đổi khi thay tệp |

```json
{
  "id": "3f2b6c1e-8a4d-4f7e-9c2a-1b5d7e9f0a12",
  "title": "Đề cương Giải tích 1",
  "description": "Tổng hợp công thức chương 1–3",
  "visibility": "PUBLIC",
  "fileType": "PDF",
  "originalFilename": "Đề cương Giải tích 1.pdf",
  "sizeBytes": 1048576,
  "fileVersion": 1,
  "owner": { "id": "9a1c7d42-5b3e-4f10-8c2d-6e7f8a9b0c1d", "displayName": "Nguyễn Văn A" },
  "isOwner": false,
  "createdAt": "2026-10-20T08:30:00.000Z",
  "updatedAt": "2026-10-20T08:30:00.000Z",
  "fileUpdatedAt": "2026-10-20T08:30:00.000Z"
}
```

**`Page<T>`**: `items` T[] · `page` integer ≥ 1 · `pageSize` 1–50 · `totalItems` integer · `totalPages` = `ceil(totalItems / pageSize)` (`0` khi rỗng). **`ValidationIssue`**: `{ field, issue, message }`.

### A7.5 Quy tắc validate

| Trường | Dùng ở | Quy tắc | `issue` khi sai |
|---|---|---|---|
| `email` | API-04, 05 | Trim → chữ thường; 3–254 ký tự; định dạng email | `REQUIRED`, `INVALID_TYPE`, `TOO_LONG`, `INVALID_FORMAT` |
| `password` | API-04 | 8–128 ký tự; không trim | `REQUIRED`, `TOO_SHORT`, `TOO_LONG` |
| `password` | API-05 | 1–128 ký tự (không lộ chính sách) | `REQUIRED`, `TOO_LONG` |
| `displayName` | API-04 | Trim; 1–100; không ký tự điều khiển | `REQUIRED`, `TOO_LONG`, `INVALID_FORMAT` |
| `title` | API-10, 11 | Trim; 1–200; không ký tự điều khiển (kể cả `\r`, `\n`) | `REQUIRED`, `TOO_SHORT`, `TOO_LONG`, `INVALID_FORMAT` |
| `description` | API-10, 11 | string \| null; trim; 0–2000; `""` → `null`; cho phép `\n`, `\r`, `\t` | `INVALID_TYPE`, `TOO_LONG`, `INVALID_FORMAT` |
| `visibility` | API-10 (bắt buộc), 11 | `PUBLIC` \| `PRIVATE`, phân biệt hoa thường | `REQUIRED`, `INVALID_ENUM` |
| `file` | API-10, 12 | Đúng 1 part tên `file`; 1…52 428 800 byte; nội dung theo §A6.4 | `REQUIRED`, `TOO_MANY_FILES`, `EMPTY_FILE` (400); 413; 415 |
| `q` | API-07, 08 | Trim; 0–100; rỗng = không lọc | `TOO_LONG` |
| `fileType` | API-07, 08 | `PDF` \| `DOCX` \| `PPTX` | `INVALID_ENUM` |
| `visibility` (lọc) | API-08 | `PUBLIC` \| `PRIVATE`; bỏ qua = tất cả | `INVALID_ENUM` |
| `sort` | API-07, 08 | `newest` (mặc định) \| `title` | `INVALID_ENUM` |
| `page` / `pageSize` | API-07, 08 | 1–10 000 (mặc định 1) / 1–50 (mặc định 12) | `INVALID_TYPE`, `OUT_OF_RANGE` |

### A7.6 Tìm kiếm, sắp xếp, phân trang

- `q` khớp **chuỗi con** trong `title` **hoặc** `description` (`LIKE '%q%' ESCAPE '\\'`), không phân biệt hoa thường/dấu theo collation (RK-08). Backend **escape** `\`, `%`, `_` (bắt buộc có test, vì `contains` của Prisma có thể không tự escape).
- `sort=newest`: `created_at DESC, id DESC`; `sort=title`: `title ASC, id ASC`.
- Offset: `LIMIT pageSize OFFSET (page-1)*pageSize`; `page > totalPages` → 200 với `items: []` và tổng đúng.
- API-07 luôn có `visibility='PUBLIC'`; API-08 luôn có `owner_id = <người gọi>`.

### A7.7 Endpoint

| ID | Method | Path | Quyền | CSRF | Thành công |
|---|---|---|---|---|---|
| API-01 | GET | `/api/health` | Công khai | — | 200 |
| API-02 | GET | `/api/health/ready` | Công khai | — | 200 / 503 |
| API-03 | GET | `/api/auth/me` | Công khai (cookie tuỳ chọn) | — | 200 |
| API-04 | POST | `/api/auth/register` | Công khai | có | 201 |
| API-05 | POST | `/api/auth/login` | Công khai | có | 200 |
| API-06 | POST | `/api/auth/logout` | Công khai (cookie tuỳ chọn) | có | 204 |
| API-07 | GET | `/api/documents` | Công khai | — | 200 |
| API-08 | GET | `/api/documents/mine` | User | — | 200 |
| API-09 | GET | `/api/documents/{id}` | Công khai + `canView` | — | 200 |
| API-10 | POST | `/api/documents` | User | có | 201 |
| API-11 | PATCH | `/api/documents/{id}` | Owner (`canManage`) | có | 200 |
| API-12 | PUT | `/api/documents/{id}/file` | Owner (`canManage`) | có | 200 |
| API-13 | GET | `/api/documents/{id}/download` | User + `canView` | — | 200 nhị phân |
| API-14 | DELETE | `/api/documents/{id}` | Owner (`canManage`) | có | 204 |

So với danh sách gợi ý chỉ thêm **API-02** (readiness, D-14).

#### API-01 — `GET /api/health`

| | |
|---|---|
| Mục đích | Liveness cho ALB/ASG; **không** truy cập DB/storage |
| Input · Ví dụ | Không · `GET /api/health` |
| Thành công | 200 `{ "data": { "status": "ok", "instanceId": "ip-10-0-11-23", "version": "1.0.0", "uptimeSeconds": 5321 } }`. `instanceId` = `INSTANCE_ID` hoặc `os.hostname()` |
| Lỗi · DB/Storage · Frontend | Không · Không · Không dùng (ALB, giám sát, demo) |

#### API-02 — `GET /api/health/ready`

| | |
|---|---|
| Mục đích | Readiness: DB `SELECT 1` và storage `HeadBucket`, mỗi kiểm tra timeout 2 s |
| Input · Ví dụ | Không · `GET /api/health/ready` |
| Thành công | 200 `{ "data": { "status": "ready", "instanceId": string, "checks": { "database": "ok", "storage": "ok" } } }` |
| Lỗi | 503 `SERVICE_UNAVAILABLE`, ví dụ `details: [{ "field": "database", "issue": "UNAVAILABLE", "message": "Không kết nối được cơ sở dữ liệu." }]` |
| DB/Storage · Frontend | `SELECT 1`; `HeadBucket` · Không dùng |

#### API-03 — `GET /api/auth/me`

| | |
|---|---|
| Mục đích | Cho FE biết trạng thái đăng nhập |
| Input · Ví dụ | Cookie phiên tuỳ chọn · `GET /api/auth/me` |
| Thành công | 200 `{ "data": { "user": UserDto \| null } }`; cookie không hợp lệ/hết hạn → `user: null` + `Set-Cookie` xoá. **Không bao giờ 401** |
| Lỗi · DB · Frontend | Lỗi chung · `sessions JOIN users` theo hash · `AuthProvider` khi khởi động; `useDownload` trước khi tải |

#### API-04 — `POST /api/auth/register`

| | |
|---|---|
| Mục đích | Tạo tài khoản và đăng nhập luôn (OD-04); rate limit §A5.6 |
| Input | `Content-Type: application/json`, `X-CSRF-Protection: 1`; body `{ email, password, displayName }` (§A7.5) |
| Thành công | 201 `{ "data": { "user": UserDto } }` + `Set-Cookie` |
| Lỗi | 400 `VALIDATION_ERROR`; 409 `EMAIL_ALREADY_EXISTS` (`details: []`, FE gắn vào trường Email); 429 |
| DB · Frontend | DELETE phiên cũ theo cookie (nếu có); transaction INSERT `users` + `sessions`; vi phạm `uq_users_email` → 409 · P-03 qua `AuthProvider.register` |

```http
POST /api/auth/register
Content-Type: application/json
X-CSRF-Protection: 1

{ "email": "SV.A@example.com ", "password": "matkhau123", "displayName": "Nguyễn Văn A" }
```

→ `201 { "data": { "user": { "id": "9a1c7d42-…", "email": "sv.a@example.com", "displayName": "Nguyễn Văn A", "createdAt": "2026-10-20T08:00:00.000Z" } } }`

#### API-05 — `POST /api/auth/login`

| | |
|---|---|
| Mục đích | Đăng nhập, tạo phiên mới; rate limit chỉ đếm lần thất bại |
| Input · Ví dụ | JSON + CSRF header; `{ email, password }` · `{ "email": "sv.a@example.com", "password": "matkhau123" }` |
| Thành công | 200 `{ "data": { "user": UserDto } }` + `Set-Cookie` |
| Lỗi | 400; 401 `INVALID_CREDENTIALS` (email không có **hoặc** sai mật khẩu); 429 |
| DB · Frontend | `users WHERE email`; DELETE phiên cũ; INSERT `sessions` · P-02 qua `AuthProvider.login` |

#### API-06 — `POST /api/auth/logout`

| | |
|---|---|
| Mục đích | Thu hồi phiên hiện tại (idempotent) |
| Input · Ví dụ | CSRF header; không body · `POST /api/auth/logout` |
| Thành công | 204, `Set-Cookie` xoá cookie |
| Lỗi · DB · Frontend | Lỗi chung · `DELETE FROM sessions WHERE id = SHA256(cookie)` · `AppHeader` qua `AuthProvider.logout` |

#### API-07 — `GET /api/documents`

| | |
|---|---|
| Mục đích | Tìm/duyệt tài liệu **Public**; phiên hợp lệ (nếu có) dùng để tính `isOwner` |
| Input | Query `q?`, `fileType?`, `sort?`, `page?`, `pageSize?` (§A7.5–A7.6) |
| Ví dụ | `GET /api/documents?q=gi%E1%BA%A3i%20t%C3%ADch&fileType=PDF&sort=newest&page=1&pageSize=12` |
| Thành công | 200 `{ "data": Page<DocumentDto> }`, ví dụ `{ "data": { "items": [DocumentDto], "page": 1, "pageSize": 12, "totalItems": 1, "totalPages": 1 } }` |
| Lỗi · DB · Frontend | 400 · `documents JOIN users WHERE visibility='PUBLIC' …` + `COUNT(*)` · P-01 |

#### API-08 — `GET /api/documents/mine`

| | |
|---|---|
| Mục đích | Kho cá nhân: mọi tài liệu (Public + Private) của người gọi |
| Input · Ví dụ | Cookie; query `q?`, `visibility?`, `fileType?`, `sort?`, `page?`, `pageSize?` · `GET /api/documents/mine?visibility=PRIVATE&page=1` |
| Thành công | 200 `{ "data": Page<DocumentDto> }`, mọi item `isOwner: true` |
| Lỗi · DB · Frontend | 401; 400 · `… WHERE owner_id = :userId …` + `COUNT(*)` · P-05 |

#### API-09 — `GET /api/documents/{id}`

| | |
|---|---|
| Mục đích | Metadata một tài liệu |
| Input · Ví dụ | Path `id`; cookie tuỳ chọn · `GET /api/documents/3f2b6c1e-8a4d-4f7e-9c2a-1b5d7e9f0a12` |
| Thành công | 200 `{ "data": DocumentDto }` |
| Lỗi · DB · Frontend | 404 `DOCUMENT_NOT_FOUND` · `documents JOIN users WHERE id = ?` · P-04; P-07 (nạp form) |

#### API-10 — `POST /api/documents`

| | |
|---|---|
| Mục đích | Tải lên tài liệu mới |
| Input | `multipart/form-data` (trình duyệt tự đặt boundary), CSRF header. Part: `title` (bắt buộc), `description` (tuỳ chọn), `visibility` (bắt buộc), `file` (bắt buộc, đúng 1). Nên gửi part văn bản **trước** `file` |
| Thành công | 201 `{ "data": DocumentDto }` + `Location: /api/documents/{id}`; `fileVersion = 1`, `isOwner = true` |
| Lỗi | 401; 400 (thiếu/sai trường, `EMPTY_FILE`, `TOO_MANY_FILES`, `UNKNOWN_FIELD`, không phải multipart → `file`/`REQUIRED`); 413 `FILE_TOO_LARGE` / `PAYLOAD_TOO_LARGE`; 415; 503 `STORAGE_UNAVAILABLE` |
| DB/Storage · Frontend | §A6.3: PutObject → INSERT · P-06 qua `api.documents.upload` (XHR) |

```bash
curl -X POST http://localhost:3000/api/documents -H "X-CSRF-Protection: 1" -b "sid=<token>" \
  -F "title=Đề cương Giải tích 1" -F "description=Tổng hợp công thức chương 1–3" \
  -F "visibility=PUBLIC" -F "file=@Đề cương Giải tích 1.pdf;type=application/pdf"
```

#### API-11 — `PATCH /api/documents/{id}`

| | |
|---|---|
| Mục đích | Sửa tiêu đề, mô tả, chế độ hiển thị |
| Input | JSON + CSRF header; ít nhất một trong `title?`, `description?: string \| null`, `visibility?`. `{}` → 400 (`body`/`NO_CHANGES`); `title: null` → 400 (`INVALID_TYPE`) |
| Ví dụ | `PATCH /api/documents/3f2b…` với `{ "visibility": "PRIVATE", "description": null }` |
| Thành công | 200 `{ "data": DocumentDto }`; `updatedAt` mới; trường tệp và `fileVersion` giữ nguyên |
| Lỗi · DB · Frontend | 401; 403 `FORBIDDEN`; 404; 400 · `UPDATE documents SET <trường được gửi> WHERE id = ?` · P-07 mục Thông tin |

#### API-12 — `PUT /api/documents/{id}/file`

| | |
|---|---|
| Mục đích | Thay tệp; giữ `id`, metadata và **visibility** |
| Input | Multipart + CSRF header; **chỉ** part `file` (part khác → 400 `UNKNOWN_FIELD`). `canManage` kiểm tra **trước khi đọc body** |
| Ví dụ | `curl -X PUT …/api/documents/3f2b…/file -H "X-CSRF-Protection: 1" -b "sid=<token>" -F "file=@ban-moi.docx"` |
| Thành công | 200 `{ "data": DocumentDto }`: `fileVersion` + 1; `originalFilename`, `fileType`, `sizeBytes`, `fileUpdatedAt` mới; `visibility`, `title`, `description` không đổi |
| Lỗi | 401; 403 `FORBIDDEN`; 404; 400; 413; 415; 503. Lỗi trước UPDATE: vẫn trỏ tệp cũ |
| DB/Storage · Frontend | §A6.6 · P-07 mục Thay thế tệp qua `api.documents.replaceFile` |

Khi từ chối (401/403/404) trước khi đọc body, backend trả lỗi kèm `Connection: close` và gọi `req.resume()` để xả body. FE vẫn phải xử lý trường hợp XHR báo `NETWORK_ERROR`.

#### API-13 — `GET /api/documents/{id}/download`

| | |
|---|---|
| Mục đích | Tải nội dung tệp (stream từ storage) |
| Input · Ví dụ | Cookie (trình duyệt tự gửi khi điều hướng) · `GET /api/documents/3f2b…/download` |
| Thành công | 200, body là byte tệp; header bên dưới |
| Lỗi | JSON trước khi stream: 401, 404, 503 `STORAGE_UNAVAILABLE`. Lỗi giữa chừng: kết nối bị huỷ |
| DB/Storage · Frontend | `SELECT documents`; `GetObject(storage_key)` · nút Tải xuống (P-01, P-04, P-05) qua `useDownload` |

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Length: 1048576
Content-Disposition: attachment; filename="De cuong Giai tich 1.pdf"; filename*=UTF-8''%C4%90%E1%BB%81%20c%C6%B0%C6%A1ng%20Gi%E1%BA%A3i%20t%C3%ADch%201.pdf
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

`Content-Type` = `mime_type`; `Content-Length` lấy từ storage. `filename` ASCII: bỏ dấu (NFD), `đ/Đ` → `d/D`, ký tự ngoài ASCII → `_`, bỏ `"` và `\`. `filename*`: `encodeURIComponent` + mã hoá thêm `'()*`. Không hỗ trợ `Range`. **Hạn chế đã biết:** nếu phiên hết hạn đúng giữa lúc FE kiểm tra API-03 và lúc tải, trình duyệt hiện JSON lỗi.

#### API-14 — `DELETE /api/documents/{id}`

| | |
|---|---|
| Mục đích | Xoá vĩnh viễn |
| Input · Ví dụ | CSRF header; không body · `DELETE /api/documents/3f2b…` |
| Thành công | 204, **kể cả khi xoá object lỗi** sau COMMIT |
| Lỗi · DB/Storage · Frontend | 401; 403; 404 (không có 409, CR-007) · §A6.7 · P-04, P-05, P-07 sau CD-01 |

## A8. Frontend UX/UI

### A8.1 Nguyên tắc

- Tên hiển thị **"Kho Tài Liệu Học Tập"**, `<html lang="vi">`. Thuật ngữ thống nhất: **Tải lên**, **Tải xuống**, **Công khai**, **Riêng tư**, **Tài liệu của tôi**.
- Không UI library; CSS Modules + token §A8.4. Mọi khối dữ liệu có 4 trạng thái: đang tải / thành công / rỗng / lỗi.
- **URL là nguồn sự thật** cho bộ lọc và trang của P-01, P-05.
- Form validate khi blur và khi gửi; sau lần gửi đầu thì validate mỗi khi thay đổi; lỗi server (`details`) gắn vào đúng trường.
- Định dạng: kích thước kiểu Việt Nam (`1 048 576` byte → "1,0 MB"; dưới 1 MB → KB) qua `Intl.NumberFormat('vi-VN')`; ngày giờ qua `Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' })`.

### A8.2 Route và điều hướng

| Page ID | Route | Guard | Component | `document.title` |
|---|---|---|---|---|
| P-01 | `/` | — | `HomePage` | Khám phá tài liệu · Kho Tài Liệu Học Tập |
| P-02 | `/login` | `GuestOnly` | `LoginPage` | Đăng nhập · … |
| P-03 | `/register` | `GuestOnly` | `RegisterPage` | Đăng ký · … |
| P-04 | `/documents/:id` | — | `DocumentDetailPage` | `{title}` · … |
| P-05 | `/me/documents` | `RequireAuth` | `MyDocumentsPage` | Tài liệu của tôi · … |
| P-06 | `/upload` | `RequireAuth` | `UploadPage` | Tải lên tài liệu · … |
| P-07 | `/documents/:id/edit` | `RequireAuth` | `EditDocumentPage` | Chỉnh sửa tài liệu · … |
| P-08 | `*` | — | `NotFoundPage` | Không tìm thấy trang · … |

```mermaid
flowchart LR
  P01["P-01 Khám phá /"]
  P02["P-02 Đăng nhập"]
  P03["P-03 Đăng ký"]
  P04["P-04 Chi tiết"]
  P05["P-05 Tài liệu của tôi"]
  P06["P-06 Tải lên"]
  P07["P-07 Chỉnh sửa"]
  P01 -->|"bấm tiêu đề"| P04
  P01 -->|"Đăng nhập để tải xuống"| P02
  P04 -->|"Đăng nhập để tải xuống"| P02
  P02 -->|"thành công, theo redirect"| P01
  P02 -->|"thành công, mặc định"| P05
  P02 <-->|"liên kết"| P03
  P03 -->|"thành công"| P05
  P05 -->|"Tải lên tài liệu"| P06
  P06 -->|"thành công hoặc Huỷ"| P05
  P05 -->|"Sửa"| P07
  P05 -->|"bấm tiêu đề"| P04
  P04 -->|"Chỉnh sửa, chỉ owner"| P07
  P07 -->|"xoá thành công"| P05
  P07 -->|"Quay lại"| P04
```

### A8.3 Khung trang

```text
Desktop ≥ 1024 px, đã đăng nhập
┌──────────────────────────────────────────────────────────────────────────────┐
│ Kho Tài Liệu Học Tập   Khám phá   Tài liệu của tôi   [Tải lên]   Nguyễn Văn A  [Đăng xuất] │
├──────────────────────────────────────────────────────────────────────────────┤
│                     <main> nội dung trang, rộng tối đa 1120 px                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ © 2026 Nhóm BTL INT3319 · Trường Đại học Công nghệ – ĐHQGHN                     │
└──────────────────────────────────────────────────────────────────────────────┘
Guest:   Kho Tài Liệu Học Tập   Khám phá                        [Đăng nhập] [Đăng ký]
Đang nạp phiên: vùng phải của header là khung xám (không nháy nút Guest).
Mobile < 640 px: logo + nút [☰] "Mở menu" (aria-expanded) → menu dọc.
```

Có skip link "Bỏ qua tới nội dung chính"; toast ở góc dưới phải (mobile: trên cùng), `aria-live="polite"`; link nav đang hoạt động có `aria-current="page"`.

### A8.4 Design token (`styles/tokens.css`)

Một bảng màu xanh duy nhất, sáng/tối tự theo `prefers-color-scheme` (`color-scheme: light dark` và `light-dark()`). Không ThemeProvider, ThemePicker, PNG palette hay localStorage. Token màu và kích thước nằm trong `styles/tokens.css`; component dùng CSS thuần/CSS Modules.

| Nhóm | Giá trị |
|---|---|
| Palette | Paper #e3f2fd, accent #2196f3, primary #0d47a1; dark bg #091540, dark accent #abd2fa |
| Chữ | Light #152b40 / muted #50667b; dark #eef2fc / muted #b7c5d9 |
| Trạng thái | Danger #b91c1c / dark #fda4af; success #166534 / dark #86efac; warning #92400e / dark #fcd34d |
| Bề mặt / viền | Trộn palette với trắng hoặc dark bg; định nghĩa cụ thể trong tokens.css |
| Chữ | Segoe UI, system-ui, sans-serif; cỡ 0.875/1/1.125/1.5/1.875rem |
| Khoảng cách | 4/8/12/16/24/32/48px |
| Khác | Radius 10/18px; container 1240px; touch 44px; breakpoint 640/1024px |

Tương phản và thao tác bàn phím kiểm bằng UI suite (M3-12); xem bằng chứng chạy lại ở M4.

### A8.5 Component dùng chung

| Component | Props chính | Hành vi / a11y |
|---|---|---|
| `AppLayout`, `AppHeader`, `AppFooter`, `SkipLink` | — | Landmark `header/nav/main/footer`; header theo trạng thái auth (§A8.6) |
| `Button`, `LinkButton` | `variant: primary\|secondary\|danger\|ghost`, `loading`, `disabled` / `to` | `loading` → khoá + spinner + `aria-busy`; cao ≥ 44 px |
| `TextField`, `PasswordField`, `TextArea`, `Select` | `label`, `name`, `value`, `onChange`, `onBlur`, `error`, `hint`, `required`, `maxLength`, `autoComplete` | `<label for>`; lỗi nối bằng `aria-describedby` + `aria-invalid`; `*` cho trường bắt buộc; PasswordField có nút "Hiện/Ẩn" (`aria-pressed`); TextArea có bộ đếm "123/2000" |
| `RadioGroup`, `VisibilityPicker` | `legend`, `options`, `value: string \| null`, `error` | `<fieldset>` + `<legend>`; **cho phép không chọn gì**; VisibilityPicker không chọn sẵn |
| `FileDropzone` | `accept`, `maxBytes`, `file`, `onFileChange`, `error`, `disabled` | Nút "Chọn tệp" mở input ẩn, hỗ trợ kéo thả, dùng được bằng Enter/Space; hiện tên, kích thước, loại |
| `ProgressBar` | `value` 0–100, `label` | `<progress>` + "45%"; `aria-live` mỗi khi tăng 10% |
| `ConfirmDialog` | `open`, `title`, `message`, `confirmLabel`, `cancelLabel`, `tone`, `loading`, `onConfirm`, `onCancel` | `<dialog>` + `showModal()`; khi `tone=danger` focus "Huỷ"; Esc = huỷ; trả focus về nút đã mở |
| `Alert`, `ToastProvider`/`useToast`, `Spinner`, `EmptyState` | `tone`, `title`, `action` / `show({tone, message})` / `label` / `title`, `description`, `action` | Alert lỗi `role="alert"`, còn lại `role="status"`; toast tự ẩn sau 5 s |
| `Pagination` | `page`, `totalPages`, `onPageChange` | `<nav aria-label="Phân trang">`, "« Trước", ≤ 5 số, "Sau »", `aria-current`; ẩn khi ≤ 1 trang |
| `VisibilityBadge`, `FileTypeBadge`, `DocumentMeta` | `visibility` / `fileType` / `document`, `fields` | Nhãn luôn có chữ, không chỉ dùng màu |
| `SearchBar` | `q`, `fileType`, `sort`, `visibility?`, `showVisibility`, `onSubmit` | `<form role="search">`, `q` maxLength 100 |
| `DocumentCard`, `MyDocumentList` | `document`, `actions` / `items`, `onDownload`, `onDelete` | Tiêu đề là link tới P-04; MyDocumentList là bảng khi ≥ 640 px, thẻ khi < 640 px |
| `DownloadAction` | `document`, `isAuthenticated`, `onDownload`, `loginHref` | Guest: link "Đăng nhập để tải xuống"; User: nút "Tải xuống" |

Hook `useDownload().download(id)`: gọi `api.auth.me()`; `user = null` → `/login?redirect=<hiện tại>`; còn phiên → click một `<a href={api.documents.downloadUrl(id)}>` ẩn.

### A8.6 Trạng thái theo xác thực

| `AuthProvider` | Header | `RequireAuth` | `GuestOnly` |
|---|---|---|---|
| `loading` (đang gọi API-03) | Khung xám | Spinner toàn trang | Spinner |
| `ready`, `user = null` | Khám phá · Đăng nhập · Đăng ký | `<Navigate to="/login?redirect=<path+search>" replace>` | Hiện trang |
| `ready`, có `user` | Khám phá · Tài liệu của tôi · Tải lên · tên · Đăng xuất | Hiện trang | `<Navigate to="/me/documents" replace>` |

| Hành động | Guest | User không phải owner | Owner (`isOwner`) |
|---|---|---|---|
| Tải xuống | Link "Đăng nhập để tải xuống" | Nút "Tải xuống" | Nút "Tải xuống" |
| Chỉnh sửa / Xoá | Ẩn | Ẩn | Hiện |
| Nhãn "Của bạn" (P-01), `VisibilityBadge` (P-04) | — | — | Hiện |

- **Hết phiên giữa chừng:** `api/*` phát `auth:unauthorized` khi nhận 401 `UNAUTHENTICATED` (không áp dụng cho `INVALID_CREDENTIALS`) → `AuthProvider` đặt Guest, toast "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", nếu đang ở route `RequireAuth` thì tới `/login?redirect=…`.
- **`safeRedirect`:** chỉ nhận đường dẫn bắt đầu bằng `/` và không bắt đầu bằng `//` hoặc `/\`; ngược lại dùng `/me/documents`.
- **Sau đăng xuất:** về `/`, toast "Đã đăng xuất".

Khi backend mất kết nối, giữ bản nháp/tệp đã chọn và dữ liệu đã nạp đúng tài khoản/tài liệu; khoá thao tác cần server, không tự gửi lại upload hay mutation. Chi tiết chỉ báo kết nối và điều khiển local xem README.

### A8.7 Đặc tả màn hình

#### P-01 — Khám phá

| | |
|---|---|
| Page ID · Route · Actor | P-01 · `/` · Guest, User |
| Input · Output | URL `q`, `fileType`, `sort`, `page` (`pageSize` cố định 12, không đặt trên URL) · lưới tài liệu Public, số kết quả, phân trang |
| Components · API | Cây bên dưới · API-07; tải xuống API-03 + API-13 qua `useDownload` |
| States | Đang tải: 6 thẻ khung xám (giữ kết quả cũ mờ khi đổi trang). Rỗng, không lọc: "Chưa có tài liệu công khai nào." (User thấy thêm "Tải lên tài liệu"). Rỗng, có lọc: "Không tìm thấy tài liệu phù hợp với “{q}”." + "Xoá bộ lọc". Lỗi: Alert "Không thể tải danh sách tài liệu." + "Thử lại" |
| Actions | Gửi tìm kiếm → URL (`page=1`) → API. Đổi `fileType`/`sort` → cập nhật URL ngay. Bấm trang → `page`. Tiêu đề → P-04. Tải xuống theo §A8.6 |
| Navigation · Acceptance | P-04, P-02 (kèm `redirect`), P-06 · AC-02.1, 02.2, 02.5; Guest thấy "Đăng nhập để tải xuống"; URL sai (`page=abc`) được đưa về mặc định trước khi gọi API |

```mermaid
flowchart TB
  page["HomePage"] --> h1["h1: Khám phá tài liệu học tập"]
  page --> sb["SearchBar<br/>q, fileType, sort"]
  page --> count["Tìm thấy N tài liệu"]
  page --> state{"Trạng thái dữ liệu"}
  state -->|"loading"| sk["6 thẻ khung xám"]
  state -->|"error"| al["Alert + nút Thử lại"]
  state -->|"empty"| es["EmptyState<br/>có / không có bộ lọc"]
  state -->|"success"| grid["Lưới DocumentCard"]
  grid --> card["DocumentCard"]
  card --> ftb["FileTypeBadge"]
  card --> title["Link tiêu đề → P-04"]
  card --> meta["DocumentMeta"]
  card --> dla["DownloadAction<br/>Guest: link đăng nhập · User: nút tải"]
  page --> pg["Pagination"]
```

```text
┌ Khám phá tài liệu học tập ─────────────────────────────────────────────┐
│ [Tìm theo tiêu đề hoặc mô tả.......] [Loại tệp: Tất cả ▾] [Mới nhất ▾] [Tìm kiếm] │
│ Tìm thấy 24 tài liệu                                                      │
│ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐     │
│ │ PDF                │ │ DOCX               │ │ PPTX   Của bạn     │     │
│ │ Đề cương Giải tích │ │ Báo cáo thực hành  │ │ Slide Mạng máy tính│     │
│ │ Nguyễn Văn A       │ │ Trần Thị B         │ │ Nguyễn Văn A       │     │
│ │ 1,0 MB · 20/10/2026│ │ 350 KB · 19/10/2026│ │ 4,2 MB · 18/10/2026│     │
│ │ [Tải xuống]        │ │ [Tải xuống]        │ │ [Tải xuống]        │     │
│ └────────────────────┘ └────────────────────┘ └────────────────────┘     │
│                    « Trước   1  [2]  3   Sau »                            │
└───────────────────────────────────────────────────────────────────────────┘
Loại tệp: Tất cả | PDF | DOCX | PPTX · Sắp xếp: Mới nhất (newest) | Tiêu đề A–Z (title)
```

#### P-02 — Đăng nhập

| | |
|---|---|
| Page ID · Route · Actor | P-02 · `/login?redirect=<path>` · Guest (`GuestOnly`) |
| Input · Output | Email, Mật khẩu; `redirect` · phiên đăng nhập, điều hướng |
| Components · API | Cây bên dưới · API-05 qua `AuthProvider.login` |
| States | Bình thường; đang gửi ("Đang đăng nhập…", form bị khoá); lỗi |
| Actions | Validate (Email bắt buộc + đúng định dạng; Mật khẩu bắt buộc) → API-05 → toast "Đăng nhập thành công" → `safeRedirect(redirect)`. `INVALID_CREDENTIALS` → Alert, xoá ô mật khẩu và focus vào đó |
| Navigation · Acceptance | `redirect` hoặc P-05; P-03 · AC-01.3, AC-03.1; đã đăng nhập mà vào `/login` → P-05 |

```mermaid
flowchart TB
  page["LoginPage · GuestOnly"] --> h1["h1: Đăng nhập"]
  page --> al["Alert<br/>INVALID_CREDENTIALS, RATE_LIMITED, NETWORK_ERROR"]
  page --> form["form"]
  form --> email["TextField Email"]
  form --> pw["PasswordField Mật khẩu<br/>nút Hiện / Ẩn"]
  form --> btn["Button Đăng nhập<br/>loading: Đang đăng nhập…"]
  page --> link["Link: Chưa có tài khoản? Đăng ký<br/>giữ tham số redirect"]
  btn -.->|"AuthProvider.login → API-05"| api(["Thành công → safeRedirect"])
```

#### P-03 — Đăng ký

| | |
|---|---|
| Page ID · Route · Actor | P-03 · `/register` · Guest (`GuestOnly`) |
| Input · Output | Tên hiển thị, Email, Mật khẩu, Nhập lại mật khẩu · tài khoản mới + phiên |
| Components · API | Cây bên dưới · API-04 qua `AuthProvider.register` (chỉ gửi `{email, password, displayName}`) |
| States | Bình thường; đang gửi ("Đang tạo tài khoản…"); lỗi |
| Actions | Validate theo §A8.8 → API-04 → toast "Đăng ký thành công. Chào mừng bạn!" → `safeRedirect` hoặc P-05. `EMAIL_ALREADY_EXISTS` → lỗi trường Email |
| Navigation · Acceptance | P-05; P-02 · AC-01.1, AC-01.2 |

```mermaid
flowchart TB
  page["RegisterPage · GuestOnly"] --> h1["h1: Tạo tài khoản"]
  page --> al["Alert lỗi chung"]
  page --> form["form"]
  form --> name["TextField Tên hiển thị"]
  form --> email["TextField Email<br/>EMAIL_ALREADY_EXISTS hiện tại đây"]
  form --> pw["PasswordField Mật khẩu"]
  form --> pw2["PasswordField Nhập lại mật khẩu<br/>chỉ kiểm tra phía client"]
  form --> btn["Button Tạo tài khoản"]
  page --> link["Link: Đã có tài khoản? Đăng nhập"]
  btn -.->|"AuthProvider.register → API-04"| api(["Thành công → P-05"])
```

#### P-04 — Chi tiết tài liệu

| | |
|---|---|
| Page ID · Route · Actor | P-04 · `/documents/:id` · Guest, User, Owner |
| Input · Output | `:id`, API-09 · metadata đầy đủ, hành động theo vai trò |
| Components · API | Cây bên dưới · API-09; API-03 + API-13; API-14 |
| States | Đang tải: Spinner. 404: "Không tìm thấy tài liệu hoặc bạn không có quyền xem." + "Về trang Khám phá". Lỗi: Alert + "Thử lại". Mô tả rỗng → "Không có mô tả." (giữ xuống dòng bằng `white-space: pre-line`) |
| Actions | "Quay lại" → `navigate(-1)` nếu có lịch sử, ngược lại `/`. Tải xuống (`useDownload`). Chỉnh sửa → P-07. Xoá → CD-01 → API-14 → toast "Đã xoá tài liệu" → P-05 |
| Navigation · Acceptance | P-01, P-02, P-05, P-07 · AC-02.4, AC-03.4, AC-09.1 |

```mermaid
flowchart TB
  page["DocumentDetailPage"] --> state{"Trạng thái"}
  state -->|"loading"| sp["Spinner"]
  state -->|"404"| nf["EmptyState: Không tìm thấy tài liệu…"]
  state -->|"error"| al["Alert + Thử lại"]
  state -->|"success"| body["Nội dung"]
  body --> back["Link ← Quay lại"]
  body --> badges["FileTypeBadge + VisibilityBadge<br/>nhãn chế độ chỉ owner thấy"]
  body --> h1["h1: tiêu đề"]
  body --> meta["DocumentMeta<br/>người đăng, ngày, tên tệp, kích thước, phiên bản"]
  body --> desc["Mô tả"]
  body --> dla["DownloadAction"]
  body --> owner{"isOwner ?"}
  owner -->|"true"| edit["LinkButton Chỉnh sửa → P-07"]
  owner -->|"true"| del["Button Xoá"]
  del --> cd1["ConfirmDialog CD-01"]
```

#### P-05 — Tài liệu của tôi

| | |
|---|---|
| Page ID · Route · Actor | P-05 · `/me/documents` · User (`RequireAuth`) |
| Input · Output | URL `q`, `visibility`, `fileType`, `sort`, `page`; API-08 · danh sách tài liệu của chính User |
| Components · API | Cây bên dưới · API-08; API-03 + API-13; API-14 |
| States | Đang tải. Rỗng, không lọc: "Bạn chưa có tài liệu nào." + "Tải lên tài liệu đầu tiên". Rỗng, có lọc: "Không có tài liệu phù hợp bộ lọc." + "Xoá bộ lọc". Lỗi: Alert + "Thử lại" |
| Actions | Lọc/trang như P-01. Xoá → CD-01 → API-14 → toast → gọi lại API-08 (trang trở thành rỗng mà `page > 1` thì lùi một trang). `DOCUMENT_NOT_FOUND` → toast "Tài liệu không còn tồn tại." + tải lại |
| Navigation · Acceptance | P-04, P-06, P-07 · AC-06.1, 06.2, 06.3, AC-09.3 |

```mermaid
flowchart TB
  page["MyDocumentsPage · RequireAuth"] --> top["h1: Tài liệu của tôi<br/>+ LinkButton Tải lên tài liệu → P-06"]
  page --> sb["SearchBar showVisibility<br/>q, visibility, fileType, sort"]
  page --> count["N tài liệu"]
  page --> state{"Trạng thái"}
  state -->|"loading"| sp["Spinner"]
  state -->|"error"| al["Alert + Thử lại"]
  state -->|"empty"| es["EmptyState<br/>Tải lên tài liệu đầu tiên / Xoá bộ lọc"]
  state -->|"success"| list["MyDocumentList<br/>bảng ≥ 640 px, thẻ < 640 px"]
  list --> row["Một dòng tài liệu"]
  row --> t["Link tiêu đề → P-04"]
  row --> vb["VisibilityBadge"]
  row --> fb["FileTypeBadge"]
  row --> acts["Tải xuống · Sửa → P-07 · Xoá"]
  acts --> cd1["ConfirmDialog CD-01"]
  page --> pg["Pagination"]
```

```text
Tài liệu của tôi                                              [Tải lên tài liệu]
[Tìm trong tài liệu của tôi....] [Chế độ: Tất cả ▾] [Loại tệp ▾] [Mới nhất ▾] [Tìm kiếm]
┌──────────────────────┬───────────┬──────┬────────────┬────────────┬──────────────────────────┐
│ Tiêu đề              │ Chế độ    │ Loại │ Kích thước │ Cập nhật   │ Thao tác                 │
├──────────────────────┼───────────┼──────┼────────────┼────────────┼──────────────────────────┤
│ Đề cương Giải tích 1 │ Công khai │ PDF  │ 1,0 MB     │ 20/10/2026 │ [Tải xuống] [Sửa] [Xoá]  │
│ Ghi chú cá nhân      │ Riêng tư  │ DOCX │ 120 KB     │ 19/10/2026 │ [Tải xuống] [Sửa] [Xoá]  │
└──────────────────────┴───────────┴──────┴────────────┴────────────┴──────────────────────────┘
```

#### P-06 — Tải lên

| | |
|---|---|
| Page ID · Route · Actor | P-06 · `/upload` · User (`RequireAuth`) |
| Input · Output | Tệp, Tiêu đề, Mô tả, Chế độ hiển thị · tài liệu mới (API-10) |
| Components · API | Cây bên dưới; `accept=".pdf,.docx,.pptx"` kèm 3 MIME của CN-01 · API-10 qua `api.documents.upload` (XHR) |
| States | Nhập liệu; đang tải (form bị khoá, %); thành công; lỗi (giữ nguyên form và tệp để thử lại); đã huỷ |
| Actions | Chọn tệp → kiểm đuôi (không phân biệt hoa thường) và 1…52 428 800 byte; Tiêu đề trống (hoặc vẫn là giá trị tự điền) → điền tên tệp bỏ đuôi (≤ 200). "Tải lên" chỉ bật khi tệp hợp lệ, tiêu đề hợp lệ, **đã chọn** chế độ. Thứ tự part: `title`, `description` (bỏ nếu rỗng), `visibility`, `file`. "Huỷ tải lên" → `abort()` → "Đã huỷ tải lên.". Rời trang khi đang tải: `beforeunload`; chuyển trang trong app thì huỷ XHR khi unmount |
| Lỗi | 413/415/`EMPTY_FILE` → trường Tệp; `VALIDATION_ERROR` → theo `details`; 503 → Alert; `NETWORK_ERROR` → "Kết nối bị gián đoạn. Vui lòng thử lại." |
| Navigation · Acceptance | Thành công → toast "Tải lên thành công" → P-05 · AC-04.1, 04.3, AC-05.1, 05.3; có tiến độ và huỷ được |

```mermaid
flowchart TB
  page["UploadPage · RequireAuth"] --> h1["h1: Tải lên tài liệu"]
  page --> al["Alert<br/>STORAGE_UNAVAILABLE, NETWORK_ERROR"]
  page --> form["form"]
  form --> dz["FileDropzone Tệp tài liệu<br/>kiểm tra đuôi, 1 byte … 50 MB"]
  form --> title["TextField Tiêu đề<br/>tự điền từ tên tệp, bộ đếm 200"]
  form --> desc["TextArea Mô tả<br/>bộ đếm 2000"]
  form --> vis["VisibilityPicker<br/>Công khai / Riêng tư, không chọn sẵn"]
  form --> btns["Button Tải lên · Button Huỷ"]
  page --> uploading{"Đang tải ?"}
  uploading -->|"có"| prog["ProgressBar %<br/>+ Button Huỷ tải lên"]
  btns -.->|"api.documents.upload → API-10"| done(["Thành công → toast → P-05"])
```

```text
Tệp tài liệu *  ┌─────────────────────────────────────────┐
                │ Kéo thả tệp vào đây hoặc [Chọn tệp]       │
                │ PDF, DOCX, PPTX · tối đa 50 MB            │
                └─────────────────────────────────────────┘
                Đã chọn: Đề cương Giải tích 1.pdf · PDF · 1,0 MB   [Đổi tệp]
Tiêu đề *       [Đề cương Giải tích 1                  ]  20/200
Mô tả           [                                      ]   0/2000
Chế độ hiển thị *
  ( ) Công khai: Mọi người đều tìm thấy; người dùng đã đăng nhập có thể tải xuống.
  ( ) Riêng tư: Chỉ bạn xem và tải xuống được.
[Tải lên]  [Huỷ]          Khi đang tải: Đang tải lên… 45% [█████████░░░░░░░] [Huỷ tải lên]
```

#### P-07 — Chỉnh sửa / thay thế / xoá

| | |
|---|---|
| Page ID · Route · Actor | P-07 · `/documents/:id/edit` · Owner (`RequireAuth` + `isOwner`) |
| Input · Output | `:id`, API-09, dữ liệu form, tệp mới · metadata mới (API-11), tệp mới (API-12) hoặc tài liệu bị xoá (API-14) |
| Components · API | Cây bên dưới; dòng tệp hiện tại: "{originalFilename} · {fileType} · {size} · Phiên bản {fileVersion} · cập nhật {fileUpdatedAt}" · API-09, 11, 12, 14 |
| States | Đang tải; 404 như P-04; `isOwner = false` → "Bạn không có quyền chỉnh sửa tài liệu này." + link P-04; mỗi mục có trạng thái gửi/lỗi riêng; Mục 2 đang tải thì khoá nút "Xoá vĩnh viễn" |
| Actions | **Lưu:** so với dữ liệu đã nạp (sau trim), chỉ gửi trường đã đổi; nút khoá khi chưa đổi gì; PRIVATE → PUBLIC → CD-03 trước. **Thay thế:** kiểm tệp như P-06 → CD-02 → API-12 có tiến độ → toast "Đã thay thế tệp", cập nhật thông tin tệp. **Xoá:** CD-01 → API-14 → toast → P-05 |
| Lỗi | `VALIDATION_ERROR` theo trường; `FORBIDDEN`/404 → trạng thái tương ứng; 503 → "Không thể thay thế tệp lúc này. Tệp hiện tại vẫn được giữ nguyên."; 413/415 → trường tệp |
| Navigation · Acceptance | P-04, P-05 · AC-07.1, 07.2, AC-08.1, 08.2, AC-09.1, 09.3 |

```mermaid
flowchart TB
  page["EditDocumentPage · RequireAuth"] --> state{"API-09 trả về"}
  state -->|"404"| nf["EmptyState: Không tìm thấy"]
  state -->|"isOwner false"| deny["EmptyState: Bạn không có quyền chỉnh sửa"]
  state -->|"isOwner true"| body["Nội dung"]
  body --> back["Link ← Quay lại tài liệu"]
  body --> s1["Mục 1: Thông tin tài liệu"]
  s1 --> f1["TextField Tiêu đề · TextArea Mô tả · VisibilityPicker"]
  s1 --> save["Button Lưu thay đổi<br/>chỉ bật khi có thay đổi"]
  save -->|"Riêng tư → Công khai"| cd3["ConfirmDialog CD-03"]
  save -.->|"API-11"| r1(["Toast Đã lưu thay đổi"])
  body --> s2["Mục 2: Thay thế tệp"]
  s2 --> info["Thông tin tệp hiện tại + ghi chú giữ chế độ hiển thị"]
  s2 --> dz["FileDropzone"]
  s2 --> rep["Button Thay thế tệp"]
  rep --> cd2["ConfirmDialog CD-02"]
  cd2 -.->|"API-12, ProgressBar"| r2(["Toast Đã thay thế tệp"])
  body --> s3["Mục 3: Vùng nguy hiểm"]
  s3 --> del["Button danger Xoá vĩnh viễn"]
  del --> cd1["ConfirmDialog CD-01"]
  cd1 -.->|"API-14"| r3(["Toast → P-05"])
```

```text
┌ Thông tin tài liệu ────────────────────────────────────────────┐
│ Tiêu đề *          [Đề cương Giải tích 1              ] 20/200 │
│ Mô tả              [Tổng hợp công thức chương 1–3     ] 29/2000│
│ Chế độ hiển thị *  (•) Công khai   ( ) Riêng tư    [Lưu thay đổi] │
├ Thay thế tệp ──────────────────────────────────────────────────┤
│ Tệp hiện tại: Đề cương Giải tích 1.pdf · PDF · 1,0 MB · Phiên bản 1 │
│ Chế độ hiển thị và thông tin được giữ nguyên. Thất bại thì giữ tệp cũ. │
│ [ Kéo thả tệp hoặc Chọn tệp ]                     [Thay thế tệp] │
├ Vùng nguy hiểm ────────────────────────────────────────────────┤
│ Xoá vĩnh viễn tài liệu và tệp. Không thể hoàn tác. [Xoá vĩnh viễn] │
└────────────────────────────────────────────────────────────────┘
```

#### P-08 — Không tìm thấy trang

| | |
|---|---|
| Page ID · Route · Actor | P-08 · `*` · Mọi người |
| Input · Output · States | Không · `h1` "Không tìm thấy trang" + "Đường dẫn không tồn tại hoặc đã bị thay đổi." + nút "Về trang Khám phá" · Tĩnh |
| Acceptance | Mở `/khong-ton-tai` → hiện P-08, không gọi API tài liệu |

### A8.8 Validate phía client

Khớp §A7.5; `MAX_UPLOAD_BYTES = 52_428_800` và danh sách đuôi nằm trong `lib/constants.ts`. Gửi form có lỗi → focus vào trường lỗi đầu tiên. Lỗi server map theo `details[].field` + `issue`; `issue` không có trong bảng → dùng `details[].message`.

| Trường | Điều kiện → thông điệp |
|---|---|
| Email | rỗng → "Vui lòng nhập email." · sai định dạng → "Email không hợp lệ." · > 254 → "Email tối đa 254 ký tự." |
| Mật khẩu | rỗng → "Vui lòng nhập mật khẩu." · đăng ký < 8 → "Mật khẩu tối thiểu 8 ký tự." · > 128 → "Mật khẩu tối đa 128 ký tự." |
| Nhập lại mật khẩu | khác → "Mật khẩu nhập lại không khớp." |
| Tên hiển thị | rỗng → "Vui lòng nhập tên hiển thị." · > 100 → "Tên hiển thị tối đa 100 ký tự." · ký tự điều khiển → "Tên hiển thị chứa ký tự không hợp lệ." |
| Tiêu đề | rỗng → "Vui lòng nhập tiêu đề." · > 200 → "Tiêu đề tối đa 200 ký tự." · xuống dòng → "Tiêu đề không được chứa ký tự xuống dòng." |
| Mô tả | > 2000 → "Mô tả tối đa 2000 ký tự." |
| Chế độ hiển thị | chưa chọn → "Vui lòng chọn chế độ hiển thị." |
| Tệp | chưa chọn → "Vui lòng chọn tệp." · sai đuôi → "Chỉ hỗ trợ tệp PDF, DOCX, PPTX." · 0 byte → "Tệp rỗng, vui lòng chọn tệp khác." · quá lớn → "Tệp vượt quá dung lượng tối đa 50 MB." |
| Từ khoá | > 100 → "Từ khoá tối đa 100 ký tự." |

### A8.9 Mã lỗi API trên UI

| `code` | Hiển thị |
|---|---|
| `UNAUTHENTICATED` | Xử lý toàn cục §A8.6 |
| `INVALID_CREDENTIALS`, `RATE_LIMITED` | Alert trên form P-02/P-03 ("Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.") |
| `EMAIL_ALREADY_EXISTS` | Lỗi trường Email (P-03) |
| `VALIDATION_ERROR` | Lỗi theo trường; không map được → Alert với `message` |
| `CSRF_REJECTED` | Alert "Yêu cầu bị từ chối vì lý do bảo mật. Vui lòng tải lại trang." |
| `FORBIDDEN` | "Bạn không có quyền thực hiện thao tác này." (P-04, P-07) |
| `DOCUMENT_NOT_FOUND` | Trạng thái "Không tìm thấy tài liệu…" (P-04, P-07); trong danh sách → toast + tải lại |
| `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE` | Lỗi trường Tệp (P-06, P-07) |
| `PAYLOAD_TOO_LARGE`, `INVALID_JSON` | Alert với `message` (`INVALID_JSON` chỉ xảy ra khi client có lỗi lập trình) |
| `STORAGE_UNAVAILABLE` | Alert với `message` |
| `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, mã lạ | Alert "Đã có lỗi xảy ra. Vui lòng thử lại." + "Mã yêu cầu: {requestId}" |
| `NETWORK_ERROR` / `ABORTED` (client) | "Không thể kết nối máy chủ. Kiểm tra mạng và thử lại." / "Đã huỷ tải lên." |

### A8.10 Hộp thoại xác nhận

| ID | Khi nào | Tiêu đề · Nội dung | Nút |
|---|---|---|---|
| CD-01 | Xoá (P-04, P-05, P-07) | Xoá vĩnh viễn tài liệu? · Tài liệu “{title}” và tệp đính kèm sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác. | "Huỷ" (focus mặc định) · "Xoá vĩnh viễn" (danger, loading) |
| CD-02 | Thay tệp (P-07) | Thay thế tệp? · Tệp hiện tại “{originalFilename}” sẽ được thay bằng “{tên tệp mới}”. Chế độ hiển thị và thông tin tài liệu được giữ nguyên. | "Huỷ" · "Thay thế" |
| CD-03 | Lưu khi đổi Riêng tư → Công khai (P-07) | Chuyển sang Công khai? · Mọi người sẽ tìm thấy tài liệu này và người dùng đã đăng nhập có thể tải xuống. | "Huỷ" · "Chuyển sang Công khai" |

Huỷ → không gọi API, không thay đổi gì (AC-09.3).

### A8.11 Responsive và accessibility

| Chiều rộng | Bố cục |
|---|---|
| < 640 px | 1 cột; header thu thành nút menu; SearchBar xếp dọc; P-05 dạng thẻ; nút form full width; dialog rộng `calc(100% - 32px)` |
| 640–1023 px | Lưới 2 cột ở P-01; SearchBar xuống 2 hàng; P-05 dạng bảng |
| ≥ 1024 px | Lưới 3 cột; container 1120 px |

Tối thiểu 360 px, không cuộn ngang; vùng bấm ≥ 44 × 44 px. Accessibility: landmark + đúng một `h1` mỗi trang + skip link; mọi ô nhập có label, trường bắt buộc có `aria-required`, lỗi nối bằng `aria-describedby` + `aria-invalid`; focus nhìn thấy được; đổi route thì focus `h1`; gửi form lỗi thì focus trường lỗi đầu; dialog giữ focus và Esc để đóng; toast `role="status"`, Alert lỗi `role="alert"`, tiến độ `aria-live`; nhãn không chỉ dùng màu; tương phản chữ ≥ 4,5:1, thành phần UI ≥ 3:1; thao tác hoàn toàn bằng bàn phím; tôn trọng `prefers-reduced-motion`. M3-12 kiểm bằng `axe` (nếu khả thi) và thử bàn phím thủ công.

### A8.12 Ánh xạ Frontend → API

| ID | Hành động UI | Trang / component | Hàm `api/*` | Endpoint |
|---|---|---|---|---|
| F-01 | Khởi động, nạp phiên (`NETWORK_ERROR` → coi là Guest + toast) | `AuthProvider` | `auth.me()` | API-03 |
| F-02 | Đăng ký | P-03 | `auth.register({email,password,displayName})` | API-04 |
| F-03 | Đăng nhập | P-02 | `auth.login({email,password})` | API-05 |
| F-04 | Đăng xuất (lỗi vẫn đặt Guest) | `AppHeader` | `auth.logout()` | API-06 |
| F-05 | Tìm / lọc / phân trang công khai | P-01 | `documents.searchPublic({q,fileType,sort,page,pageSize:12})` | API-07 |
| F-06 | Xem chi tiết | P-04 | `documents.get(id)` | API-09 |
| F-07 | Tải xuống | P-01, P-04, P-05 (`useDownload`) | `auth.me()` rồi điều hướng `documents.downloadUrl(id)` | API-03, API-13 |
| F-08 | Guest bấm "Đăng nhập để tải xuống" | P-01, P-04 | — (điều hướng cục bộ `/login?redirect=…`) | — |
| F-09 | Kho cá nhân / lọc / phân trang | P-05 | `documents.listMine({q,visibility,fileType,sort,page,pageSize:12})` | API-08 |
| F-10 | Tải lên | P-06 | `documents.upload({title,description,visibility,file}, {onProgress, signal})` | API-10 |
| F-11 | Huỷ tải lên / huỷ thay thế | P-06, P-07 | `AbortController.abort()` → `xhr.abort()` | — (server dọn tệp tạm) |
| F-12 | Nạp form chỉnh sửa | P-07 | `documents.get(id)` | API-09 |
| F-13 | Lưu metadata | P-07 | `documents.update(id, {title?, description?})` | API-11 |
| F-14 | Đổi chế độ hiển thị (+CD-03) | P-07 | `documents.update(id, {visibility, …})` | API-11 |
| F-15 | Thay thế tệp (+CD-02) | P-07 | `documents.replaceFile(id, file, {onProgress, signal})` | API-12 |
| F-16 | Xoá (+CD-01) | P-04, P-05, P-07 | `documents.remove(id)` | API-14 |
| F-17 | Phiên hết hạn (mọi 401) | `api/client.ts` → `AuthProvider` | — | — (trạng thái cục bộ §A8.6) |
| F-18 | Validate client, hiện/ẩn mật khẩu, chọn tệp, mở/đóng dialog, đồng bộ URL, menu mobile | Nhiều trang | — | — (trạng thái cục bộ) |

```mermaid
flowchart LR
  subgraph UI["Trang / component"]
    uiAuth["AuthProvider"]
    uiHeader["AppHeader"]
    uiP01["P-01 Khám phá"]
    uiP02["P-02 Đăng nhập"]
    uiP03["P-03 Đăng ký"]
    uiP04["P-04 Chi tiết"]
    uiP05["P-05 Tài liệu của tôi"]
    uiP06["P-06 Tải lên"]
    uiP07["P-07 Chỉnh sửa"]
    uiDl["hook useDownload"]
  end
  subgraph FN["Hàm api/*"]
    fnMe["auth.me"]
    fnReg["auth.register"]
    fnLogin["auth.login"]
    fnLogout["auth.logout"]
    fnSearch["documents.searchPublic"]
    fnMine["documents.listMine"]
    fnGet["documents.get"]
    fnUpload["documents.upload"]
    fnUpdate["documents.update"]
    fnReplace["documents.replaceFile"]
    fnRemove["documents.remove"]
    fnUrl["documents.downloadUrl"]
  end
  subgraph EP["Endpoint backend"]
    ep03["API-03 GET /api/auth/me"]
    ep04["API-04 POST /api/auth/register"]
    ep05["API-05 POST /api/auth/login"]
    ep06["API-06 POST /api/auth/logout"]
    ep07["API-07 GET /api/documents"]
    ep08["API-08 GET /api/documents/mine"]
    ep09["API-09 GET /api/documents/:id"]
    ep10["API-10 POST /api/documents"]
    ep11["API-11 PATCH /api/documents/:id"]
    ep12["API-12 PUT /api/documents/:id/file"]
    ep13["API-13 GET /api/documents/:id/download"]
    ep14["API-14 DELETE /api/documents/:id"]
  end
  uiAuth --> fnMe
  uiP02 -->|"qua AuthProvider"| fnLogin
  uiP03 -->|"qua AuthProvider"| fnReg
  uiHeader -->|"qua AuthProvider"| fnLogout
  uiP01 --> fnSearch
  uiP01 --> uiDl
  uiP04 --> fnGet
  uiP04 --> fnRemove
  uiP04 --> uiDl
  uiP05 --> fnMine
  uiP05 --> fnRemove
  uiP05 --> uiDl
  uiP06 --> fnUpload
  uiP07 --> fnGet
  uiP07 --> fnUpdate
  uiP07 --> fnReplace
  uiP07 --> fnRemove
  uiDl --> fnMe
  uiDl --> fnUrl
  fnMe --> ep03
  fnReg --> ep04
  fnLogin --> ep05
  fnLogout --> ep06
  fnSearch --> ep07
  fnMine --> ep08
  fnGet --> ep09
  fnUpload --> ep10
  fnUpdate --> ep11
  fnReplace --> ep12
  fnUrl -.->|"trình duyệt điều hướng"| ep13
  fnRemove --> ep14
```

## A9. Sơ đồ tuần tự

`FE` = SPA; `BE` = một instance backend bất kỳ; `TMP` = đĩa tạm; `DB` = MySQL; `OS` = object storage. Tên endpoint, bảng, cột khớp §A4 và §A7.

### SEQ-01 — Đăng ký / Đăng nhập / Đăng xuất

**Trigger** form P-03, P-02, nút Đăng xuất · **Trạng thái** INSERT `users` + `sessions`; INSERT/DELETE `sessions` · **Output** `UserDto` + cookie; 204 · **Lỗi/phục hồi** 409, 401, 400, 429, 403; transaction đăng ký rollback toàn bộ nếu một INSERT lỗi.

```mermaid
sequenceDiagram
  autonumber
  actor U as Guest
  participant FE as Frontend P-03, P-02
  participant BE as Backend
  participant DB as MySQL
  U->>FE: Điền form đăng ký
  FE->>FE: Validate phía client
  FE->>BE: POST /api/auth/register, JSON, X-CSRF-Protection 1
  BE->>BE: csrfGuard, rate limit, validate zod, chuẩn hoá email, băm argon2id
  BE->>DB: BEGIN, INSERT users, INSERT sessions với id là SHA-256 của token
  alt Email đã tồn tại
    DB-->>BE: Vi phạm uq_users_email, ROLLBACK
    BE-->>FE: 409 EMAIL_ALREADY_EXISTS
    FE-->>U: Lỗi tại trường Email
  else Thành công
    DB-->>BE: COMMIT
    BE-->>FE: 201 data.user và Set-Cookie sid HttpOnly SameSite Lax
    FE-->>U: Chuyển tới /me/documents
  end
  U->>FE: Lần sau, điền form đăng nhập
  FE->>BE: POST /api/auth/login, JSON, X-CSRF-Protection 1
  BE->>DB: SELECT users WHERE email
  BE->>BE: argon2 verify, dùng hash giả nếu không có email
  alt Sai email hoặc mật khẩu
    BE-->>FE: 401 INVALID_CREDENTIALS
    FE-->>U: Email hoặc mật khẩu không đúng
  else Đúng
    BE->>DB: DELETE phiên cũ theo cookie nếu có, INSERT sessions
    BE-->>FE: 200 data.user và Set-Cookie
    FE-->>U: Chuyển tới redirect an toàn hoặc /me/documents
  end
  U->>FE: Bấm Đăng xuất
  FE->>BE: POST /api/auth/logout, X-CSRF-Protection 1
  BE->>DB: DELETE sessions WHERE id là SHA-256 của cookie
  BE-->>FE: 204 và Set-Cookie Max-Age 0
  FE-->>U: Về trang Khám phá, trạng thái Guest
```

### SEQ-02 — Tải lên thành công

Kiểm quyền và nội dung trước các bước storage; tệp tạm được xoá trong finally (§A6).

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant BE as Backend
  participant DB as MySQL
  participant OS as Object storage
  FE->>BE: Request hợp lệ, đã kiểm quyền
  BE->>OS: PutObject(newKey)
  OS-->>BE: OK
  BE->>DB: INSERT documents, file_version = 1
  DB-->>BE: OK
  BE-->>FE: 201 DocumentDto
```

### SEQ-03 — Tải lên thất bại

Kiểm quyền và nội dung trước các bước storage; tệp tạm được xoá trong finally (§A6).

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant BE as Backend
  participant DB as MySQL
  participant OS as Object storage
  FE->>BE: Request hợp lệ, đã kiểm quyền
  BE->>OS: PutObject(newKey)
  alt Storage lỗi
    OS--xBE: Lỗi
    BE-->>FE: 503, không INSERT
  else Storage OK nhưng DB lỗi
    BE->>DB: INSERT documents
    DB--xBE: Lỗi
    BE->>OS: DeleteObject(newKey) best-effort
    Note over BE,OS: Xoá lỗi: WARN storage.orphan + storageKey
    BE-->>FE: Lỗi DB gốc
  end
```

### SEQ-04 — Tìm kiếm công khai

**Trigger** mở `/` hoặc gửi SearchBar · **Input** `q`, `fileType`, `sort`, `page` · **Trạng thái** không (chỉ đọc) · **Output** 200 `Page<DocumentDto>` chỉ có Public · **Lỗi** 400 / 500 / mạng → Alert + "Thử lại".

```mermaid
sequenceDiagram
  autonumber
  actor U as Guest
  participant FE as Frontend P-01
  participant BE as Backend
  participant DB as MySQL
  U->>FE: Nhập từ khoá, chọn loại tệp, bấm Tìm kiếm
  FE->>FE: Cập nhật URL với q, fileType, page bằng 1
  FE->>BE: GET /api/documents?q=giai&fileType=PDF&sort=newest&page=1&pageSize=12
  BE->>BE: sessionLoader, không có cookie nên auth là null
  BE->>BE: Validate query, escape ký tự đặc biệt của LIKE trong q
  BE->>DB: SELECT COUNT và SELECT documents JOIN users WHERE visibility PUBLIC, LIKE trên title hoặc description, file_type, ORDER BY created_at DESC, LIMIT 12 OFFSET 0
  DB-->>BE: Danh sách và tổng số
  BE-->>FE: 200 data là Page of DocumentDto, isOwner false
  alt Có kết quả
    FE-->>U: Lưới thẻ tài liệu, nút Đăng nhập để tải xuống, phân trang
  else Không có kết quả
    FE-->>U: EmptyState Không tìm thấy tài liệu phù hợp
  else Lỗi 400, 500 hoặc lỗi mạng
    FE-->>U: Alert kèm nút Thử lại
  end
```

### SEQ-05 — Tải xuống khi đã đăng nhập

**Trigger** "Tải xuống" · **Input** `id`, cookie · **Trạng thái** không · **Output** 200 byte tệp, `attachment` · **Lỗi** hết phiên → P-02; 404; 503 trước khi stream; ngắt giữa chừng.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant FE as Frontend
  participant BE as Backend
  participant DB as MySQL
  participant OS as Object storage
  U->>FE: Bấm Tải xuống
  FE->>BE: GET /api/auth/me
  BE->>DB: SELECT sessions theo hash cookie
  alt Không có phiên hoặc phiên hết hạn
    BE-->>FE: 200 user là null
    FE-->>U: Chuyển tới /login?redirect=trang hiện tại
  else Phiên hợp lệ
    BE-->>FE: 200 user
    FE->>BE: Trình duyệt điều hướng thẻ a ẩn tới GET /api/documents/:id/download
    BE->>DB: SELECT sessions, SELECT documents WHERE id
    BE->>BE: requireAuth, canView trả ALLOW
    BE->>OS: GetObject storage_key
    alt Storage lỗi trước khi gửi header
      OS--xBE: Lỗi
      BE-->>FE: 503 STORAGE_UNAVAILABLE dạng JSON
    else Thành công
      OS-->>BE: Stream và ContentLength
      BE-->>FE: 200 Content-Disposition attachment, stream byte
      FE-->>U: Trình duyệt lưu tệp, trang hiện tại giữ nguyên
    end
  end
```

### SEQ-06 — Truy cập trái phép tài liệu Private

**Trigger** User B hoặc Guest thao tác trên tài liệu của A (qua UI hoặc gọi API trực tiếp) · **Trạng thái** **không thay đổi gì** · **Output** 404 (X Private), 403 (quản lý Y Public), 401 (Guest tải xuống).

```mermaid
sequenceDiagram
  autonumber
  actor B as User B
  actor G as Guest
  participant FE as Frontend
  participant BE as Backend
  participant DB as MySQL
  Note over DB: X là PRIVATE của User A, Y là PUBLIC của User A
  B->>FE: Mở /documents/X
  FE->>BE: GET /api/documents/X
  BE->>DB: SELECT documents WHERE id là X
  BE->>BE: canView, X PRIVATE và B không phải owner nên NOT_FOUND
  BE-->>FE: 404 DOCUMENT_NOT_FOUND
  FE-->>B: Không tìm thấy tài liệu hoặc bạn không có quyền xem
  B->>BE: PATCH /api/documents/X gọi trực tiếp, có X-CSRF-Protection
  BE->>BE: requireAuth OK, canManage trả NOT_FOUND
  BE-->>B: 404 DOCUMENT_NOT_FOUND
  B->>BE: DELETE /api/documents/Y gọi trực tiếp
  BE->>BE: canManage, Y PUBLIC và B không phải owner nên FORBIDDEN
  BE-->>B: 403 FORBIDDEN
  G->>BE: GET /api/documents/Y/download không có cookie
  BE->>BE: requireAuth thất bại
  BE-->>G: 401 UNAUTHENTICATED
  G->>BE: GET /api/documents/X/download
  BE-->>G: 401 UNAUTHENTICATED, không tiết lộ X có tồn tại hay không
  Note over BE,DB: Không có thay đổi dữ liệu. API-07 không bao giờ trả X
```

### SEQ-07 — Thay thế tệp thành công

Kiểm quyền và nội dung trước các bước storage; tệp tạm được xoá trong finally (§A6).

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant BE as Backend
  participant DB as MySQL
  participant OS as Object storage
  FE->>BE: Request hợp lệ, đã kiểm quyền
  BE->>OS: PutObject(newKey)
  OS-->>BE: OK
  BE->>DB: UPDATE file fields, file_version + 1 WHERE id
  DB-->>BE: 1 dòng
  BE->>OS: DeleteObject(oldKey) best-effort
  Note over BE,OS: Xoá lỗi: WARN storage.orphan
  BE-->>FE: 200 DocumentDto, visibility giữ nguyên
```

### SEQ-08 — Thay thế tệp thất bại

Kiểm quyền và nội dung trước các bước storage; tệp tạm được xoá trong finally (§A6).

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant BE as Backend
  participant DB as MySQL
  participant OS as Object storage
  FE->>BE: Request hợp lệ, đã kiểm quyền
  BE->>OS: PutObject(newKey)
  alt Storage lỗi
    OS--xBE: Lỗi
    BE-->>FE: 503, giữ tệp cũ
  else Storage OK
    BE->>DB: UPDATE file fields WHERE id
    DB--xBE: 0 dòng hoặc lỗi DB
    BE->>OS: DeleteObject(newKey) best-effort
    Note over BE,OS: Xoá lỗi: WARN storage.orphan
    BE-->>FE: 404 nếu 0 dòng, hoặc lỗi DB gốc
  end
```

### SEQ-09 — Xoá vĩnh viễn, gồm lỗi một phần

Kiểm quyền và nội dung trước các bước storage; tệp tạm được xoá trong finally (§A6).

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant BE as Backend
  participant DB as MySQL
  participant OS as Object storage
  FE->>BE: Request hợp lệ, đã kiểm quyền
  BE->>DB: DELETE documents WHERE id, lấy storageKey
  alt DB lỗi
    DB--xBE: Lỗi
    BE-->>FE: 500, không xoá object
  else DB thành công
    DB-->>BE: Dòng vừa xoá
    BE->>OS: DeleteObject(key) best-effort
    Note over BE,OS: Xoá lỗi: WARN storage.orphan + storageKey
    BE-->>FE: 204
  end
```

## A10. Local và AWS

### A10.1 Local: cổng, URL, Docker Compose

Launcher/controller nằm trong backend/dev, cầu nối Vite trong frontend/dev, UI trong frontend/src/dev. Start.vbs/Stop.vbs hoặc run.bat điều khiển các dịch vụ do launcher tạo; controller listen 127.0.0.1:3001. Hướng dẫn đăng nhập developer ở §A5.9 và README.

| Thành phần | Địa chỉ |
|---|---|
| Frontend dev (Vite, proxy `/api` → `:3000`) | `http://localhost:5173` |
| Backend API / chế độ production-like (`SERVE_FRONTEND=true`) | `http://localhost:3000/api` / `http://localhost:3000` |
| Controller local | `http://127.0.0.1:3001`, chỉ qua cầu nối Vite/launcher |
| Backend instance thứ 2 (thử stateless) | `http://localhost:3002` (`PORT=3002`) |
| MySQL | `localhost:3306`, DB `btl_cloud` / `btl_cloud_test`, user `btl` |
| SeaweedFS S3 API (không có console) | `http://localhost:9000` |

| Service | Image | Cấu hình | Volume · Healthcheck |
|---|---|---|---|
| `mysql` | `mysql:8.4` | `MYSQL_ROOT_PASSWORD=root_dev_password`, `MYSQL_DATABASE=btl_cloud`, `MYSQL_USER=btl`, `MYSQL_PASSWORD=btl_dev_password`; mount `docker/mysql/init` | `mysql-data` · `mysqladmin ping` |
| `seaweedfs` | `chrislusf/seaweedfs:4.48` | `server -dir=/data -master.volumeSizeLimitMB=1024 -volume.max=100 -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json`; cổng `9000:8333`; identity `minioadmin` / `minioadmin-dev` trong `docker/seaweedfs/s3.json` | `seaweedfs-data` · `wget http://127.0.0.1:9333/cluster/status` |

Compose không tạo bucket: chạy `npm --prefix backend run storage:init` (tạo `btl-cloud-documents` và `btl-cloud-documents-test`, bỏ qua nếu đã có; không đặt quyền ẩn danh). `run.bat` dùng cùng `s3.json` và chạy S3 API thẳng ở `127.0.0.1:9000`.

`01-init.sql` (chỉ cho dev): tạo `btl_cloud_test` (`utf8mb4_0900_ai_ci`) và `GRANT ALL PRIVILEGES ON *.* TO 'btl'@'%'` (Prisma cần quyền tạo shadow DB). Các mật khẩu trên là **giá trị dev công khai**. MinIO không còn image miễn phí (RK-06) nên đã thay bằng SeaweedFS (CR-001); tên access key `minioadmin` được giữ để `.env.example` không đổi.

### A10.2 Biến môi trường backend

`backend/.env.example` được commit; `backend/.env` nằm trong `.gitignore`. Giới hạn upload là **hằng số trong mã** (`MAX_UPLOAD_BYTES`) ở cả hai phía, không phải biến môi trường.

| Biến | Dev (`.env.example`) | Test | AWS (chốt ở M5) |
|---|---|---|---|
| `NODE_ENV` | `development` | `test` | `production` |
| `PORT` | `3000` | (Supertest dùng app trực tiếp) | `3000` |
| `DATABASE_URL` | `mysql://btl:btl_dev_password@localhost:3306/btl_cloud` | `…/btl_cloud_test` | endpoint RDS, mật khẩu theo OD-07, TLS |
| `S3_BUCKET` | `btl-cloud-documents` | `btl-cloud-documents-test` | tên bucket ở M5 |
| `S3_REGION` | `us-east-1` | `us-east-1` | `us-east-1` |
| `S3_ENDPOINT` | `http://localhost:9000` | `http://localhost:9000` | *(trống → endpoint AWS mặc định)* |
| `S3_FORCE_PATH_STYLE` | `true` | `true` | `false` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `minioadmin` / `minioadmin-dev` | như dev | **KHÔNG đặt**: SDK lấy credentials từ IAM Role qua IMDSv2 |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000,http://localhost:3001` | `http://localhost:5173` | origin công khai (OD-05) |
| `SESSION_COOKIE_NAME` | `sid` | `sid` | `__Host-sid` (HTTPS) / `sid` (HTTP) |
| `COOKIE_SECURE` / `HSTS_ENABLED` | `false` / `false` | `false` / `false` | `true` / `true` nếu HTTPS |
| `SESSION_TTL_HOURS` | `168` | `168` | `168` |
| `TRUST_PROXY` | `false` | `false` | `1` |
| `UPLOAD_TMP_DIR` | `./tmp/uploads` | thư mục tạm của OS | `/var/lib/btl-cloud/tmp` (EBS) |
| `AUTH_RATE_LIMIT_MAX` | `20` | `1000` | `20` |
| `LOG_LEVEL` | `debug` | `silent` | `info` |
| `SERVE_FRONTEND` / `FRONTEND_DIST_DIR` | `false` / `../frontend/dist` | `false` / — | `true` / `/opt/btl-cloud/frontend/dist` |
| `INSTANCE_ID` | *(trống → hostname)* | — | *(trống → hostname)* |

### A10.3 Frontend: proxy và build

`vite.config.ts`: `server.port = 5173`, `strictPort`, `proxy['/api'] = { target: 'http://localhost:3000', changeOrigin: false }`. Frontend **không có biến môi trường**. `build` = `tsc -b && vite build` → `frontend/dist/` (`base: '/'`). Script: `dev`, `build`, `lint`, `test` (Vitest, không cần backend), `test:e2e` (Playwright, cần stack ở `:3000`).

### A10.4 Timeout và giới hạn (đề xuất, kiểm chứng ở M5)

| Thành phần | Giá trị | Lý do |
|---|---|---|
| Node `server.requestTimeout` | 900 000 ms | Upload 50 MB qua mạng chậm có thể vượt mặc định 300 s |
| Node `keepAliveTimeout` / `headersTimeout` | 125 000 / 126 000 ms | Phải lớn hơn ALB idle timeout để tránh 502 |
| ALB idle timeout / deregistration delay | 120 s / 60 s | PutObject sau khi nhận xong tệp không trao đổi dữ liệu với client; đủ thời gian khi scale-in |
| Graceful shutdown / readiness check | ≤ 30 s / 2 s mỗi kiểm tra | §A10.5, API-02 |

### A10.5 Khởi động và tắt

```text
Windows không cần Docker: run.bat (tải MySQL/SeaweedFS portable, cài, tạo .env, migrate, storage:init, mở web) · run.bat stop

Lần đầu với Docker Desktop và Node 24:
  1. docker compose up -d --wait              # đợi mysql và seaweedfs healthy
  2. npm ci                                   # ở root; postinstall chạy npm ci trong backend/ và frontend/
  3. copy backend\.env.example backend\.env   # bash: cp backend/.env.example backend/.env
  4. npm --prefix backend run prisma:deploy
  5. npm --prefix backend run storage:init    # tạo bucket dev + test
  6. Terminal 1: npm --prefix backend run dev      → http://localhost:3000/api/health
  7. Terminal 2: npm --prefix frontend run dev     → http://localhost:5173

Production-like (cùng origin, giống ALB):
  npm run build                              # build cả backend và frontend
  PowerShell: $env:SERVE_FRONTEND='true'; $env:INSTANCE_ID='local-1'; npm --prefix backend start → http://localhost:3000
Instance thứ 2: PowerShell: $env:SERVE_FRONTEND='true'; $env:PORT='3002'; $env:INSTANCE_ID='local-2'; npm --prefix backend start

Tắt: Ctrl+C (graceful shutdown) · docker compose stop (giữ dữ liệu) · docker compose down -v (xoá dữ liệu)
```

Cổng 3001 dành cho controller local; dùng 3002 cho backend thứ hai. Khi kiểm thao tác ghi giữa hai instance, đặt ALLOWED_ORIGINS gồm http://localhost:3000,http://localhost:3002 cho cả hai process. Đây là hướng dẫn thử thêm; M4-08 vẫn chưa nghiệm thu.

Graceful shutdown (SIGTERM/SIGINT): `server.close()` → chờ request đang chạy tối đa 30 s → `prisma.$disconnect()` → thoát mã 0 (quá hạn thì buộc thoát). Kiểm tra sức khoẻ: `curl http://localhost:3000/api/health` và `/api/health/ready`.

### A10.6 Môi trường test

| Loại | Lệnh | Cần hạ tầng | Phạm vi |
|---|---|---|---|
| Backend unit | `npm --prefix backend test` | Không | policy, FileInspector, schema, mapper, content-disposition, ObjectStorage |
| Backend integration | `npm --prefix backend run test:integration` | MySQL + SeaweedFS, DB/bucket test | Supertest qua toàn app; lỗi storage giả lập bằng chèn lỗi; chạy tuần tự |
| Frontend | `npm --prefix frontend test` | Không | RTL, mock `fetch`/XHR |
| E2E | `npm --prefix frontend run test:e2e` | Stack production-like `:3000` | Playwright, FR-01…FR-09 |
| UI mock | `npm --prefix frontend run test:ui` | Không | Playwright với API mock (`ui-tests/`) |
| Kiểm chứng | `node scripts/verify/authz-matrix.mjs`, `upload-matrix.mjs` | Stack production-like `:3000` | Ma trận phân quyền và upload |
| Như CI | `npm ci && npm run lint && npm run build && npm test` (root) | Không | Khớp job `ci-required` |

### A10.7 Giả định production

Một artifact cho mọi instance (§A3.7); instance giống hệt nhau, stateless, cấu hình bằng biến môi trường (nguồn theo OD-06/07); Node.js 24 trên Amazon Linux 2023 (cách cài phụ thuộc OD-06; không có NAT thì đóng gói runtime vào artifact trên S3); chạy bằng systemd (`Restart=always`, user không phải root, `EnvironmentFile`); `prisma migrate deploy` là bước riêng trước rollout. **Chưa provisioning gì** (S7).

### A10.8 Ánh xạ local → AWS

| Local | AWS | Thay đổi cấu hình |
|---|---|---|
| Container MySQL 8.4 | RDS MySQL 8.4 `db.t3.micro` Single-AZ, không public, DB subnet group 2 private subnet | `DATABASE_URL`, TLS |
| SeaweedFS bucket | S3 bucket private + S3 Gateway Endpoint | `S3_ENDPOINT` trống, path-style tắt, bỏ access key → IAM Role |
| Backend `:3000` (và `:3002` khi thử local) | EC2 trong ASG (2–4) trên 2 private subnet, cùng artifact, cổng 3000 | `SERVE_FRONTEND=true`, `TRUST_PROXY=1` |
| Vite proxy `:5173` | ALB listener → target group HTTP:3000 | SPA do backend phục vụ |
| `backend/tmp/uploads` | EBS gp3 root volume | `UPLOAD_TMP_DIR` |
| Log console / healthcheck compose | CloudWatch Logs (nếu OD-06 cho phép) / ALB target health `/api/health` | CloudWatch Agent |
| `backend/.env` | Launch template user data / SSM Parameter Store (OD-07) | |

### A10.9 Thiết kế AWS

**Stateless:** phiên ở bảng `sessions` trên RDS; tệp ở S3; tệp tạm chỉ trong một request; rate limit theo instance (RK-10). ALB **không** cần sticky session.

**IAM Role cho EC2** (instance profile, không access key; launch template bắt buộc IMDSv2 `HttpTokens=required`, hop limit 1):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "DocumentObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"],
      "Resource": "arn:aws:s3:::<DOCUMENT_BUCKET>/documents/*"
    },
    {
      "Sid": "BucketReadinessCheck",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": "arn:aws:s3:::<DOCUMENT_BUCKET>"
    }
  ]
}
```

Gắn thêm tuỳ OD-06/07: `CloudWatchAgentServerPolicy`, `AmazonSSMManagedInstanceCore`, `s3:GetObject` trên bucket artifact, `ssm:GetParameter` + `kms:Decrypt`.

**Security group:**

| SG | Inbound | Outbound |
|---|---|---|
| `sg-alb` | TCP 80 (và 443 nếu HTTPS) từ `0.0.0.0/0` | TCP 3000 tới `sg-app` |
| `sg-app` | TCP 3000 **chỉ** từ `sg-alb` | 3306 tới `sg-rds`; 443 tới prefix list S3; 443 tới SG interface endpoint (nếu có) |
| `sg-rds` | TCP 3306 **chỉ** từ `sg-app` | — |

Không mở SSH từ Internet.

- **S3:** §A6.2; EC2 đi qua S3 Gateway Endpoint (route table private). Bucket policy theo `aws:SourceVpce` là tuỳ chọn (sẽ chặn cả console).
- **RDS:** private subnet, `PubliclyAccessible=false`, chỉ `sg-app` vào; TLS bằng CA bundle RDS; user ứng dụng có quyền trên schema `btl_cloud` (gồm DDL cho migration); bật automated backup.
- **ALB:** internet-facing trên 2 public subnet; listener 80 (forward, hoặc redirect 443 nếu HTTPS); target group HTTP:3000, health check `/api/health`, matcher 200, interval 15 s, timeout 5 s, healthy 2 / unhealthy 3; không stickiness; timeout §A10.4.
- **ASG:** launch template AL2023, `t3.micro`, EBS gp3 20 GiB mã hoá (khớp tổng 40 GB EBS của S2), instance profile, IMDSv2; min 2 / desired 2 / max 4; 2 private subnet; health check type ELB, grace 300 s; target tracking theo OD-09; triển khai bản mới bằng instance refresh. Tương thích: instance stateless, `/api/health` nhanh, graceful shutdown nằm trong deregistration delay.
- **CloudWatch:** metric có sẵn không cần agent (EC2 `CPUUtilization`; ALB `RequestCount`, `TargetResponseTime`, `HTTPCode_Target_5XX_Count`, `UnHealthyHostCount`; RDS `CPUUtilization`, `FreeStorageSpace`, `DatabaseConnections`; ASG group metrics). Alarm đề xuất: (1) CPU trung bình ASG > 70% trong 2 × 1 phút; (2) `UnHealthyHostCount ≥ 1` trong 2 phút, **kích hoạt thử** bằng cách dừng service trên một instance (S5 #7); (3) 5XX > 10 trong 5 phút; (4) RDS `FreeStorageSpace < 2 GiB`. Nếu có CloudWatch Logs (OD-06): metric filter `level ≥ 50` và `storage.orphan`. Thông báo qua SNS email.

### A10.10 Ràng buộc AWS chưa giải quyết

Không đưa con số giá; M5-09 tra bằng AWS Pricing Calculator.

| ID | Vấn đề | Phương án / ảnh hưởng | Quyết định |
|---|---|---|---|
| U-01 | Egress cho EC2 private (OD-06): tải artifact/runtime, gửi log, Session Manager | (a) chỉ S3 Gateway Endpoint (không phí theo giờ): artifact + runtime trên S3; repo `dnf` AL2023 phục vụ từ S3 nên thường truy cập được qua gateway endpoint (**cần kiểm chứng**); không có CloudWatch Logs/SSM. (b) thêm interface endpoint `logs`, `ssm`, `ssmmessages`, `ec2messages`: phí theo giờ mỗi endpoint mỗi AZ + dữ liệu. (c) NAT Gateway: phí theo giờ + GB, chịu lỗi AZ thì cần 1 NAT/AZ. Chưa có trong dự toán S2 (DS-04) | M5 |
| U-02 | HTTPS (OD-05) | Tên miền + ACM (chứng chỉ public miễn phí; tên miền/hosted zone có phí) hoặc HTTP (RK-04) | M5 |
| U-03 | Mật khẩu RDS (OD-07) | SSM SecureString (cần endpoint `ssm` hoặc NAT) / user data (ai đọc được launch template là thấy) | M5 |
| U-04 | Tính sẵn sàng | ALB và ASG trải 2 AZ; RDS Single-AZ là điểm lỗi đơn (DS-07); Multi-AZ tăng đáng kể chi phí | Đã chấp nhận Single-AZ |
| U-05 | Metric scaling (OD-09) | CPU khó tăng (RK-05) / `ALBRequestCountPerTarget` | M5 sau thử tải |
| U-06 | IPv4 công khai | ALB internet-facing dùng IPv4 công khai (có phí); EC2 không có IP công khai; đối chiếu DS-04 | M5-09 |
| U-07 | Burst credit t3 | `t3.micro` mặc định unlimited, CPU cao lâu có thể phát sinh phí; dùng chế độ standard hoặc giới hạn thời gian thử tải | M5 |
| U-08 | Quota tài khoản | Giới hạn vCPU/ALB có thể chặn ASG tối đa 4 instance | M5-09 |

## A11. Kiểm tra nhất quán

### A11.1 Truy vết FR → UC → API → Page → AC → Task

| FR | UC | API | Page | AC | Task kiểm thử |
|---|---|---|---|---|---|
| FR-01 | UC-01, 02, 03 | API-03, 04, 05, 06 | P-02, P-03, AppHeader | AC-01.1–01.6 | M2-01, M2-03, M2-04, M3-05, M3-06, M4-04, M4-05 |
| FR-02 | UC-04, 05 | API-07, 09 | P-01, P-04 | AC-02.1–02.5 | M2-08, M2-09, M3-07, M3-08, M4-04 |
| FR-03 | UC-06 | API-03, 13 | P-01, P-04, P-05 | AC-03.1–03.5 | M2-09, M3-08, M4-05, M4-06 |
| FR-04 | UC-07 | API-10 | P-06 | AC-04.1–04.5 | M2-06, M2-07, M3-10, M4-06, M4-07 |
| FR-05 | UC-07 | API-10 | P-06 | AC-05.1–05.3 | M2-07, M3-10, M4-04 |
| FR-06 | UC-08 | API-08 | P-05 | AC-06.1–06.3 | M2-08, M3-09, M4-05 |
| FR-07 | UC-09, 10 | API-11 | P-07 | AC-07.1–07.3 | M2-10, M3-11, M4-05 |
| FR-08 | UC-11 | API-12 | P-07 | AC-08.1–08.3 | M2-11, M2-13, M3-11, M4-07 |
| FR-09 | UC-12 | API-14 | P-04, P-05, P-07 | AC-09.1–09.3 | M2-12, M2-13, M3-09, M3-11, M4-07 |

### A11.2 Use Case → API → hành động UI

Bảng §A11.1 giữ ánh xạ FR/UC/API/Page/AC/task. Đối chiếu hành động cụ thể F-01…F-18 tại §A8.12; mô tả UC ở §A2.4 nêu endpoint và trang sử dụng. F-08, F-11, F-17, F-18 là hành động cục bộ.

### A11.3 API → dữ liệu

Chi tiết DB/Storage đặt cùng mỗi endpoint trong §A7.7: API-03…06 dùng users/sessions; API-07…14 dùng documents, JOIN users khi trả owner. API-10/12 ghi object trước metadata; API-14 xoá metadata trước object. Query/index ở §A4.4; bất biến và bù trừ ở §A6.

### A11.4 Ranh giới bảo mật

| Ranh giới | Mối đe doạ | Cơ chế | Tham chiếu |
|---|---|---|---|
| Internet → ALB | Nghe lén cookie | HTTPS + `Secure` (OD-05) | §A5.8 |
| Trình duyệt → API (ghi) | CSRF | Header + `Origin` + SameSite | §A5.4 |
| Trình duyệt → API (danh tính) | Đánh cắp/giả mạo phiên | Token 256 bit, DB chỉ lưu hash, HttpOnly, xoay phiên, hết hạn cố định | §A5.2–A5.3 |
| API → tài liệu | Truy cập trái phép | `requireAuth` + `canView`/`canManage` trước khi đọc body | §A5.5 |
| API → danh sách | Lộ Private qua tìm kiếm | Lọc ở SQL | §A7.6 |
| Upload | Tệp giả, path traversal, tệp lớn | Giới hạn, chữ ký nội dung, key không lấy từ input, làm sạch tên | §A6.4 |
| Download | XSS / sniffing | `attachment` + `nosniff` + CSP | API-13, §A5.8 |
| App → S3 / RDS | Lộ credentials; truy cập DB từ ngoài | IAM Role + IMDSv2; private subnet + SG + TLS | §A10.9 |
| Mật khẩu / log | DB bị lộ; lộ bí mật qua log | argon2id; pino redact | §A5.1, §A5.8 |
| Đăng nhập / giao diện / redirect | Dò mật khẩu; clickjacking; open redirect | Rate limit; `frame-ancestors 'none'`; `safeRedirect` | §A5.6, §A5.8, §A8.6 |

Luồng lỗi trọng yếu đã định nghĩa: upload (§A6.3, SEQ-03), thay thế (§A6.6, SEQ-08), xoá một phần (§A6.7, SEQ-09), crash (§A6.8), storage lỗi khi tải (§A6.5), hết phiên (§A5.7), DB dừng (API-01 vẫn 200, API-02 503, còn lại 500), đồng thời (D-08). Tổng hợp tại §A6.9.

### A11.5 Nhất quán triển khai

- [x] FE và BE cùng giả định **cùng origin** (§A3.7, §A10.3): không `API_BASE_URL`, không CORS; cookie/CSRF chạy như nhau ở dev và production.
- [x] Mọi khác biệt local/AWS nằm trong biến môi trường (§A10.2).
- [x] Giới hạn 52 428 800 byte là cùng một hằng số ở FE (§A8.8) và BE (§A6.3).
- [x] MySQL 8.4 ở cả local và RDS, cùng collation.
- [x] Liveness không phụ thuộc DB/S3 (D-14); dọn tệp tạm và phiên lúc khởi động (D-10).
- [ ] HTTPS, egress, bí mật, metric scaling **chưa chốt** (OD-05/06/07/09); không ảnh hưởng M1–M4.

Kết quả kiểm tra chéo (lệnh và số liệu): bằng chứng task M0-11 trong MILESTONES.

### Design Baseline

```text
BASELINE_VERSION: 1.0
DESIGN_STATUS: APPROVED
CONTRACT_STATUS: APPROVED
OWNER_APPROVAL: APPROVED (MILESTONES › OWNER DESIGN APPROVAL)
```

**Quyết định chưa giải quyết** (chi tiết: CONTEXT §C6.6):
- Cần xác nhận trước M1/M3: OD-01, OD-13, OD-14, cùng các mặc định OD-02, 03, 04, 10, 11, 12.
- Cần owner duyệt PR khi tới lúc: OD-08.
- Chuyển sang M5 (không chặn M1–M4): OD-05, 06, 07, 09; U-01…U-08.

Sau khi owner phê duyệt, tài liệu này là baseline đóng băng cho triển khai. Agent thiết kế **không** tự xác nhận phê duyệt.
