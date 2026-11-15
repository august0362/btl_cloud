# ARCHITECTURE — Hệ thống Lưu trữ và Chia sẻ Tài liệu Học tập

> Thiết kế kỹ thuật và hợp đồng API. Yêu cầu, ma trận quyền: [PROJECT_OVERVIEW](PROJECT_OVERVIEW.md). Tiến độ, CR: [MILESTONES](MILESTONES.md).
>
> **§A7 là hợp đồng API duy nhất** giữa frontend và backend. Đổi field, mã lỗi hay hành vi phải ghi CR ở MILESTONES và được owner duyệt.
>
> Sơ đồ Mermaid được GitHub tự vẽ; trong VS Code dùng extension `bierner.markdown-mermaid`.

**Mục lục:** [A1 Quyết định](#a1-quyết-định-kiến-trúc) · [A2 Use case](#a2-use-case-và-truy-vết) · [A3 Ứng dụng](#a3-kiến-trúc-ứng-dụng) · [A4 CSDL](#a4-cơ-sở-dữ-liệu) · [A5 Xác thực](#a5-xác-thực-và-phân-quyền) · [A6 Storage](#a6-object-storage-và-vòng-đời-tài-liệu) · [A7 API](#a7-rest-api-contract) · [A8 Frontend](#a8-frontend-uxui) · [A9 Tuần tự](#a9-sơ-đồ-tuần-tự) · [A10 Local và AWS](#a10-local-và-aws) · [A11 Hạn chế](#a11-hạn-chế-đã-chấp-nhận) · [A12 Mở rộng](#a12-mở-rộng-e1e8)

## A1. Quyết định kiến trúc

### A1.1 Technology stack

Phiên bản chính xác ghim trong `package-lock.json`.

| Tầng | Lựa chọn | Lý do |
|---|---|---|
| Frontend | React + TypeScript + Vite; React Router | SPA build tĩnh, backend phục vụ cùng origin |
| Giao diện | CSS thuần + design token + CSS Modules | Không UI library; CSP chặt |
| Backend | Node.js 24 LTS + TypeScript + Express 5 | Express 5 tự chuyển lỗi async tới error middleware |
| Validation | `zod` | Một schema vừa validate vừa sinh type |
| ORM / DB | Prisma Migrate + MySQL 8.4 (local và RDS) | Migration có version; collation `utf8mb4_0900_ai_ci` |
| Object storage | AWS SDK v3, **một adapter** cho SeaweedFS (local) và S3 | Local → AWS chỉ đổi cấu hình |
| Upload | `multer` (disk storage), `yauzl` | Không đệm 50 MB trong RAM; phân biệt DOCX/PPTX thật |
| Bảo mật / log | `argon2`, `helmet`, `cookie-parser`, `express-rate-limit`; `pino` JSON ra stdout | Dễ gửi lên CloudWatch |
| Test | Vitest + Supertest; React Testing Library; Playwright | |
| Local | Docker Compose hoặc `run.bat` (MySQL/SeaweedFS portable) | Tái lập được cho cả nhóm |

**Không dùng:** microservices, Kubernetes, Redis, Elasticsearch, queue, JWT, CORS, presigned URL, UI/state library, package dùng chung FE–BE.

### A1.2 Quyết định thiết kế

| ID | Quyết định | Lý do · đánh đổi |
|---|---|---|
| D-01 | **Modular monolith**: một process Node phục vụ API + SPA | 4 người hiểu hết; ASG chỉ một loại instance |
| D-02 | **Cùng origin**: production Express phục vụ `frontend/dist`; dev dùng Vite proxy `/api` | Cookie SameSite chạy tự nhiên, không cần CORS |
| D-03 | **Phiên opaque lưu DB + cookie HttpOnly** | Thu hồi ngay; instance stateless · 1 truy vấn PK mỗi request |
| D-04 | **CSRF** = SameSite=Lax + header bắt buộc `X-CSRF-Protection: 1` + allowlist `Origin` | Không cần endpoint cấp token |
| D-05 | **Upload/download qua backend**: tệp tạm (EBS) → kiểm → S3; download stream qua backend; bucket private | Một điểm kiểm quyền · băng thông đi qua EC2 |
| D-06 | **Object key bất biến**: `documents/{documentId}/{objectId}.{ext}` | Thay tệp không ghi đè; key không chứa dữ liệu người dùng |
| D-07 | **Bù trừ best-effort** sau lỗi DB; xoá object lỗi ghi WARN `storage.orphan` | DB và storage không có transaction chung |
| D-08 | **Last write wins** khi thay tệp; `file_version` chỉ là bộ đếm | Không khoá lạc quan, không 409 |
| D-09 | Thử xoá object cũ **ngay sau UPDATE** | Không thời gian ân hạn |
| D-10 | **Không worker**; khởi động dọn `UPLOAD_TMP_DIR` và phiên hết hạn | Object lỗi xử lý thủ công |
| D-11 | ID UUID v4 `CHAR(36)` | Không đoán được; sinh trước INSERT |
| D-12 | Tìm kiếm `LIKE '%q%'` trên `title`/`description` | Đủ cho quy mô demo; FULLTEXT khi cần |
| D-13 | Phân trang offset (`page`, `pageSize`) | Đơn giản, UI có số trang |
| D-14 | Tách **liveness** `/api/health` và **readiness** `/api/health/ready` | ALB/ASG không thay máy hàng loạt khi RDS/S3 lỗi |
| D-15 | Không package dùng chung FE–BE; type viết tay theo §A7 + contract test | Hai phía làm độc lập |
| D-16 | Root `package.json` không dependency; `backend/`, `frontend/` có lockfile riêng | Tránh xung đột lockfile |
| D-17 | Cấu hình qua biến môi trường, validate bằng zod khi khởi động | Cùng artifact chạy local và AWS |
| D-18 | Log JSON ra stdout | Chuẩn cho mọi cách thu log |

Quyết định cho phần mở rộng dùng ID `XD-xx` (§A12.1).

### A1.3 Cấu trúc thư mục

```text
/
├── README.md, run.bat, Start.vbs, Stop.vbs   chạy local (Windows có/không Docker)
├── package.json                root không dependency; scripts → scripts/run-all.mjs
├── docker-compose.yml, docker/ MySQL 8.4 + SeaweedFS 4.48 (S3 API :9000)
├── scripts/                    run-all.mjs; verify/ (authz, upload, admin-isolation, local-production); load/ (thử tải)
├── docs/                       PROJECT_OVERVIEW, ARCHITECTURE, MILESTONES, WINDOWS_HOSTING
├── .github/                    CODEOWNERS, workflows/ci.yml (job ci-required)
├── backend/
│   ├── prisma/                 schema.prisma, migrations/
│   ├── scripts/init-storage.ts tạo bucket local
│   ├── src/                    server.ts, app.ts, container.ts, config/, http/, modules/ (health, auth, users, documents, files, audit),
│   │                           storage/, metrics/, cleanup/, db/, lib/
│   ├── dev/                    launcher, controller :3001, tài khoản developer (chỉ dev)
│   ├── admin/                  [gitignore] tiến trình admin :3003 (§A12)
│   └── test/                   unit/, integration/, helpers/
└── frontend/
    ├── src/                    main.tsx, App.tsx, api/, auth/, components/, pages/, hooks/, lib/, styles/
    ├── src/admin/              [gitignore] UI /admin (nạp bằng import.meta.glob)
    ├── dev/                    cầu nối Vite ↔ controller (chỉ dev)
    ├── e2e/                    Playwright trên stack thật :3000
    └── ui-tests/               Playwright với API mock
```

`.github/` được CODEOWNERS bảo vệ; agent chỉ đề xuất qua PR.

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
- Mọi quyết định quyền tài liệu nằm trong `document.policy.ts`.
- Frontend: `components` không gọi `api`; chỉ `api/*` gọi `fetch`/`XMLHttpRequest`.
- Mã commit **không bao giờ** import thư mục admin (§A12.2).

## A2. Use case và truy vết

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

| UC | FR | API | Trang | Luồng chính · lỗi đáng chú ý |
|---|---|---|---|---|
| UC-01 Đăng ký | FR-01 | API-04 | P-03 | Chuẩn hoá email → argon2id → transaction INSERT users + sessions → tự đăng nhập · 409 email trùng, 429 |
| UC-02 Đăng nhập | FR-01 | API-05 | P-02 | Verify → xoá phiên cũ của trình duyệt → tạo phiên mới · 401 chung cho sai email/mật khẩu, 429 |
| UC-03 Đăng xuất | FR-01 | API-06 | header | Xoá phiên theo hash cookie → 204; idempotent |
| UC-04 Tìm kiếm | FR-02 | API-07 | P-01 | Bộ lọc từ URL; SQL chỉ lấy PUBLIC |
| UC-05 Xem chi tiết | FR-02, 06 | API-09 | P-04 | Public cho mọi người, Private chỉ owner · 404 |
| UC-06 Tải xuống | FR-03 | API-03 + 13 | P-01, 04, 05 | FE kiểm phiên → điều hướng link tải → `canView` → stream · hết phiên → login kèm redirect; 503 storage |
| UC-07 Tải lên | FR-04, 05 | API-10 | P-06 | XHR có tiến độ → tệp tạm → FileInspector → PutObject → INSERT · 400/413/415/503; lỗi trước INSERT không tạo tài liệu |
| UC-08 Kho cá nhân | FR-06 | API-08 | P-05 | Lọc `owner_id` = người gọi |
| UC-09/10 Sửa, đổi chế độ | FR-07 | API-11 | P-07 | Chỉ gửi trường đã đổi; Private → Public cần xác nhận CD-03 · 403/404 |
| UC-11 Thay tệp | FR-08 | API-12 | P-07 | PutObject key mới → UPDATE → thử xoá key cũ; giữ visibility · lỗi trước UPDATE giữ tệp cũ |
| UC-12 Xoá | FR-09 | API-14 | P-04, 05, 07 | Xác nhận CD-01 → DELETE metadata → thử xoá object → 204 |

Thực thi: Guest có `req.auth = null` và chỉ vào được API-01…07, 09; User có `req.auth = { userId, sessionId, user }`; Owner khi `documents.owner_id === req.auth.userId`, kiểm trong `document.loader` **trước** khi đọc body.

## A3. Kiến trúc ứng dụng

### A3.1 Sơ đồ container

```mermaid
flowchart LR
  browser["Trình duyệt<br/>React SPA"]
  subgraph app["Backend process: Node.js 24 + Express 5, chạy N instance"]
    spa["Static SPA<br/>frontend/dist"]
    apiC["REST API /api/*"]
  end
  db[("MySQL<br/>users, sessions, documents, audit_events")]
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
    policy["DocumentPolicy<br/>canView, canManage"]
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
    mem["InMemoryObjectStorage<br/>chỉ dùng trong test"]
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
  storage -.-> mem
```

Hợp đồng chính:
- `ObjectStorage`: `putObject(key, filePath, contentType, sizeBytes)`, `getObject(key)`, `deleteObject(key)` (idempotent), `checkHealth()`; lỗi là `StorageError { UNAVAILABLE | NOT_FOUND }`.
- `DocumentPolicy.canView / canManage(doc, viewer)` → `ALLOW | NOT_FOUND | FORBIDDEN` (hàm thuần).
- `FileInspector.inspect(tmpPath, originalName, sizeBytes)` → `InspectedFile { fileType, mimeType, extension, sanitizedFilename, sizeBytes, tmpPath }`.
- `DocumentRepository.updateFile` trả số dòng bị ảnh hưởng; 0 dòng nghĩa là tài liệu đã bị xoá (404).

### A3.3 Đặc tả module

Mỗi module trả lời ba câu: input/output, phụ thuộc, hành vi khi lỗi. Module mở rộng ở §A12.3.

| Module | Trách nhiệm | Input → Output | Phụ thuộc | Lỗi |
|---|---|---|---|---|
| `config/env` | Parse, validate biến môi trường (§A10.2) | `process.env` → `Config` | zod | Thiếu/sai → log tên biến, `exit(1)` |
| `http/middleware` | requestId, logger, helmet, JSON 16 KB, cookie, `csrfGuard`, `sessionLoader`, `requireAuth`, `authRateLimit`, `notFound` | request → `req.id`, `req.auth` | config, AuthService | 403 `CSRF_REJECTED`, 401, 429, 404 |
| `http/errorHandler` | Map lỗi sang envelope §A7.2; xoá tệp tạm còn sót | Error → JSON | logger | Lỗi lạ → 500 + log stack (không trả stack) |
| `http/validate` + `*.schemas.ts` | Schema zod §A7.5 | `req` → DTO | zod | 400 `VALIDATION_ERROR` + `details` |
| `modules/health` | API-01, API-02 | — → JSON | Prisma, ObjectStorage | API-02 → 503 `SERVICE_UNAVAILABLE` |
| `modules/auth`, `users` | Đăng ký, đăng nhập, đăng xuất, nạp phiên, cookie | DTO, token → `UserDto`, `AuthContext` | repositories, argon2 | `EMAIL_ALREADY_EXISTS`, `INVALID_CREDENTIALS` |
| `documents/document.loader` | Nạp theo `:id`, áp policy **trước khi đọc body** | `:id`, `req.auth` → `res.locals.document` | DocumentRepository, policy | 404/403; route multipart thì xả body |
| `documents` (service) | Tìm, liệt kê, xem, tạo, sửa, thay, xoá, mở download (§A6) | DTO, `InspectedFile` → `DocumentDto`, `Page`, stream | DocumentRepository, ObjectStorage | `STORAGE_UNAVAILABLE`, `DOCUMENT_NOT_FOUND` |
| `files/upload.middleware` | Đúng 1 tệp vào `UPLOAD_TMP_DIR`, tên UTF-8 | multipart → `req.file`, `req.body` | multer | 413 `FILE_TOO_LARGE`, 400 |
| `files/file-inspector` | Xác định loại theo nội dung (§A6.4); làm sạch tên | tệp tạm → `InspectedFile` | fs, yauzl | 415, 400 `EMPTY_FILE` |
| `storage` | put/get/delete/checkHealth | key, tệp → void / stream | AWS SDK v3 | `StorageError` |
| `lib/logger` | Log JSON, redact bí mật (§A5.8) | sự kiện → stdout | pino | — |
| `http/static` | Phục vụ SPA khi `SERVE_FRONTEND=true` (§A3.4) | GET không thuộc `/api` → file | express.static | Thiếu dist → chỉ phục vụ API |
| FE `api/client.ts`, `upload.ts` | `credentials: 'same-origin'`, gắn header CSRF, mở `{data}`, phát `auth:unauthorized` khi 401; upload XHR có tiến độ/huỷ | tham số → `T` | fetch, XHR | `ApiError`; `NETWORK_ERROR`, `ABORTED` |
| FE `auth/*` | `AuthProvider` (API-03, không localStorage), `RequireAuth`, `GuestOnly` | context → trang / `<Navigate>` | api/auth | 401 → Guest + toast |
| FE `components`, `pages`, `hooks`, `lib` | UI thuần; ghép trang; upload/download/filter; validate, format, `safeRedirect` | props/URL → JSX | api (chỉ qua pages/hooks) | Hiển thị theo §A8.4 |
| `backend/dev` | Launcher, controller :3001, tài khoản developer | lệnh Start/Stop → dịch vụ, log | developer auth (§A5.9) | Chỉ dev; không lên AWS |

### A3.4 Phục vụ SPA cùng origin

1. Artifact triển khai: `backend/dist` + `node_modules` (production) + `backend/prisma` + `frontend/dist`.
2. Khi `SERVE_FRONTEND=true`: router `/api/*` → `/api/*` không khớp → 404 JSON → `express.static` (`/assets/*`: `public, max-age=31536000, immutable`) → SPA fallback cho GET/HEAD `Accept: text/html` → `index.html` (`no-cache`) → còn lại 404.
3. ALB chỉ một rule: mọi đường dẫn → target group cổng 3000. FE luôn gọi `/api/...` tương đối; không có `API_BASE_URL`.
4. Dev: Vite :5173 proxy `/api` → :3000; trình duyệt chỉ thấy một origin nên cookie và CSRF chạy như production.

### A3.5 Pipeline xử lý request

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

Hệ quả: **xác thực và phân quyền chạy trước khi nhận tệp upload**, nên request không hợp lệ không thể bắt server ghi 50 MB xuống đĩa.

## A4. Cơ sở dữ liệu

### A4.1 Dữ liệu nằm ở đâu

| Dữ liệu | Nơi lưu |
|---|---|
| Tài khoản (email, hash mật khẩu, tên hiển thị) | MySQL `users` |
| Phiên (hash token, thời hạn); token gốc chỉ nằm trong cookie | MySQL `sessions` |
| Metadata tài liệu: **nguồn sự thật** về sự tồn tại và quyền truy cập | MySQL `documents` |
| Sự kiện audit (E7) | MySQL `audit_events` (§A12.4) |
| Byte nội dung tệp; object chỉ có `Content-Type` | Object storage, key `documents/{documentId}/{objectId}.{ext}` |
| Tệp đang upload (sống trong một request) | Đĩa cục bộ `UPLOAD_TMP_DIR` (EBS trên AWS) |

### A4.2 ERD

```mermaid
erDiagram
  users ||--o{ sessions : "có"
  users ||--o{ documents : "sở hữu"
  users {
    char36 id PK "UUID v4"
    varchar254 email UK "trim, chữ thường"
    varchar255 password_hash "argon2id PHC"
    varchar100 display_name
    datetime3 created_at
    datetime3 updated_at
    datetime3 last_active_at "E1, NULL được"
    datetime3 deletion_started_at "E2, NULL được"
  }
  sessions {
    char64 id PK "SHA-256 hex của token"
    char36 user_id FK "ON DELETE CASCADE"
    datetime3 created_at
    datetime3 expires_at
  }
  documents {
    char36 id PK "UUID v4"
    char36 owner_id FK "ON DELETE RESTRICT"
    varchar200 title
    varchar2000 description "NULL được"
    enum visibility "PUBLIC, PRIVATE, không mặc định"
    enum file_type "PDF, DOCX, PPTX"
    varchar100 mime_type "suy từ file_type"
    varchar255 original_filename "đã làm sạch"
    int_unsigned size_bytes
    varchar512 storage_key UK
    int_unsigned file_version "từ 1"
    datetime3 created_at
    datetime3 updated_at
    datetime3 file_updated_at
  }
```

### A4.3 Đặc tả bảng

Quy ước: InnoDB; `utf8mb4` / `utf8mb4_0900_ai_ci`; `DATETIME(3)` lưu UTC; bảng/cột snake_case (Prisma `@@map`/`@map`); UUID sinh ở ứng dụng.

**`users`**: `id CHAR(36)` PK · `email VARCHAR(254)` UNIQUE `uq_users_email` · `password_hash VARCHAR(255)` · `display_name VARCHAR(100)` · `created_at`, `updated_at DATETIME(3)` (`updated_at` = Prisma `@updatedAt`). Cột mở rộng `last_active_at`, `deletion_started_at`: §A12.4. Bất biến: email luôn trim + chữ thường; `password_hash` không rời backend; không API nào trả email của người khác.

**`sessions`**: `id CHAR(64)` PK (SHA-256 hex của token) · `user_id` FK → `users.id` ON DELETE CASCADE, INDEX `idx_sessions_user_id` · `created_at` · `expires_at` INDEX `idx_sessions_expires_at`. Hợp lệ ⇔ `expires_at > NOW(3)`; không bao giờ gia hạn.

**`documents`**:

| Cột | Kiểu | Null | Ràng buộc |
|---|---|---|---|
| `id` | `CHAR(36)` | NO | PK |
| `owner_id` | `CHAR(36)` | NO | FK → `users.id` ON DELETE RESTRICT |
| `title` | `VARCHAR(200)` | NO | 1–200 ký tự |
| `description` | `VARCHAR(2000)` | YES | |
| `visibility` | `ENUM('PUBLIC','PRIVATE')` | NO | **không mặc định** (BR-04) |
| `file_type` | `ENUM('PDF','DOCX','PPTX')` | NO | |
| `mime_type` | `VARCHAR(100)` | NO | suy từ `file_type`, không lấy từ client |
| `original_filename` | `VARCHAR(255)` | NO | đã làm sạch (§A6.4) |
| `size_bytes` | `INT UNSIGNED` | NO | 1…52 428 800 |
| `storage_key` | `VARCHAR(512)` | NO | UNIQUE `uq_documents_storage_key` |
| `file_version` | `INT UNSIGNED` | NO | `1`; +1 mỗi lần thay tệp |
| `created_at` / `updated_at` | `DATETIME(3)` | NO | `updated_at` đổi khi sửa metadata hoặc thay tệp |
| `file_updated_at` | `DATETIME(3)` | NO | đổi khi thay tệp |

Index: `idx_documents_visibility_created (visibility, created_at)`, `idx_documents_owner_created (owner_id, created_at)`.
- **INV-D1:** mọi bản ghi trỏ tới object đã ghi thành công (BR-06).
- **INV-D2:** `visibility` chỉ đổi qua API-11; API-12 không ghi cột này (BR-07).
- **INV-D3:** `storage_key` dạng `documents/{id}/{uuid}.{ext}`, `ext` khớp `file_type`.

### A4.4 Truy vấn, vòng đời, migration

| Thao tác | Truy vấn | Index |
|---|---|---|
| Nạp phiên | `sessions JOIN users WHERE sessions.id = ?` | PK |
| Đăng nhập | `users WHERE email = ?` | `uq_users_email` |
| Tìm công khai | `WHERE visibility='PUBLIC' [AND (title LIKE ? OR description LIKE ?)] [AND file_type=?] ORDER BY created_at DESC, id DESC LIMIT/OFFSET` + `COUNT(*)` | `idx_documents_visibility_created` |
| Kho cá nhân | `WHERE owner_id=? [AND visibility=?] …` | `idx_documents_owner_created` |
| Dọn phiên lúc khởi động | `DELETE FROM sessions WHERE expires_at < NOW(3) LIMIT 1000`, lặp theo lô | `idx_sessions_expires_at` |

`Uploading`/`Replacing` chỉ là trạng thái tạm trong một request; `documents` chỉ chứa tài liệu Active. Tạo: PutObject OK rồi INSERT OK. Thay: UPDATE OK, `file_version` +1; lỗi thì giữ tệp cũ. Xoá: DELETE OK.

**Migration:** SQL commit trong `backend/prisma/migrations/`, không sửa migration đã áp dụng. Hiện có `init`, `drop_storage_cleanup_tasks` (CR-007), `user_last_active` (E1), `user_deletion` (E2), `audit_events` (E7).
- Dev: `npm --prefix backend exec -- prisma migrate dev --name <tên>` chỉ trên DB không có dữ liệu thật.
- Test: `prisma migrate reset --force` chỉ trên `btl_cloud_test`.
- DB có dữ liệu / production: sao lưu trước, rồi `npm --prefix backend run prisma:deploy`; migration phải tương thích ngược (expand → deploy → contract) vì ASG chạy song song bản cũ và mới.

## A5. Xác thực và phân quyền

### A5.1 Mô hình và mật khẩu

- **Phiên opaque lưu DB + cookie HttpOnly** (D-03). Không JWT, không Authorization header, không token trong JS/localStorage. FE biết trạng thái đăng nhập qua API-03.
- Mật khẩu: argon2id, `memoryCost = 19456` KiB, `timeCost = 2`, `parallelism = 1`; lưu chuỗi PHC; **không trim**; 8–128 ký tự khi đăng ký.
- Email không tồn tại → vẫn `verify` với hash giả để thời gian phản hồi tương đương.

### A5.2 Vòng đời phiên

| Sự kiện | Hành vi |
|---|---|
| Tạo token | `crypto.randomBytes(32).toString('base64url')`; DB lưu `id = SHA-256(token)` hex |
| Tạo phiên | API-04 (cùng transaction với INSERT user), API-05; `expires_at = now + SESSION_TTL_HOURS` (168 h) |
| Xoay phiên | API-04/05 có cookie phiên → DELETE phiên đó trước khi tạo mới (chống session fixation) |
| Mỗi request `/api` | `sessionLoader`: không cookie → `null`; không thấy → `null` + xoá cookie; hết hạn → DELETE + xoá cookie; hợp lệ → `req.auth` |
| Hết hạn | Cố định, không gia hạn trượt |
| Đăng xuất | DELETE theo hash, xoá cookie, luôn 204 |

### A5.3 Cookie

| Thuộc tính | Dev (HTTP) | Production HTTPS | Production chỉ HTTP |
|---|---|---|---|
| Tên (`SESSION_COOKIE_NAME`) | `sid` | `__Host-sid` | `sid` |
| `HttpOnly` / `SameSite` / `Path` | có / `Lax` / `/` | như dev | như dev |
| `Secure` (`COOKIE_SECURE`) | không | **có** | không (rủi ro chấp nhận) |
| `Domain` | không đặt | không đặt | không đặt |
| `Max-Age` | `SESSION_TTL_HOURS × 3600` | như dev | như dev |

### A5.4 Chống CSRF

Áp dụng cho mọi `/api/*` POST, PUT, PATCH, DELETE:
1. Bắt buộc header `X-CSRF-Protection: 1`; thiếu/sai → 403 `CSRF_REJECTED`.
2. Có header `Origin` thì phải thuộc `ALLOWED_ORIGINS`; không có `Origin` (curl, Supertest) thì chỉ dựa vào bước 1.
3. `SameSite=Lax` là lớp thêm. GET (kể cả API-13) không cần header.

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

| Endpoint | CSRF | `requireAuth` | Policy | Từ chối |
|---|---|---|---|---|
| API-07 | — | — | SQL `visibility='PUBLIC'` | — |
| API-08 | — | có | SQL `owner_id = viewer` | 401 |
| API-09 | — | — | `canView` | 404 |
| API-10 | có | có | — (người tải lên thành owner) | 403 CSRF / 401 |
| API-11, 14 | có | có | `canManage` | 403 CSRF / 401 / 404 / 403 `FORBIDDEN` |
| API-12 | có | có | `canManage` **trước khi đọc body** | như API-11 |
| API-13 | — | có | `canView` | 401 / 404 |

`id` sai định dạng UUID → 404. Danh sách luôn lọc ở SQL. `DocumentDto.owner` chỉ có `id` + `displayName`. User đang bị xoá (`DELETING`, §A12) coi như không tồn tại.

### A5.6 Giới hạn tần suất

API-04, API-05: cửa sổ 15 phút, tối đa `AUTH_RATE_LIMIT_MAX` (20) request/IP **trên mỗi instance**; API-05 chỉ đếm lần thất bại. Vượt → 429 `RATE_LIMITED` + `Retry-After`. Sau ALB đặt `TRUST_PROXY=1`. Với N instance, ngưỡng thực tế là N × giới hạn.

### A5.7 Phiên hết hạn và request không được phép

| Tình huống | Backend | Frontend |
|---|---|---|
| Guest gọi endpoint cần đăng nhập | 401 `UNAUTHENTICATED` | Tới `/login?redirect=<đường dẫn hiện tại>` |
| Cookie hết hạn/bị thu hồi gọi endpoint cần đăng nhập | Xoá cookie + 401 | `markSignedOut()`, toast "Phiên đăng nhập đã hết hạn…", tới login kèm redirect |
| Cookie hết hạn gọi API-03 / API-07, 09 | Xoá cookie; 200 `{user: null}` / phục vụ như Guest | Guest, không toast |
| Không phải owner, tài liệu Public | 403 `FORBIDDEN` | "Bạn không có quyền thực hiện thao tác này." |
| Tài liệu Private của người khác | 404 | "Không tìm thấy tài liệu hoặc bạn không có quyền xem." |

### A5.8 Cross-origin, HTTPS, header, log

- **Cross-origin:** không bật CORS. `ALLOWED_ORIGINS` dev: `http://localhost:5173,http://localhost:3000,http://localhost:3001`.
- **HTTPS:** TLS kết thúc tại ALB (hoặc tunnel khi host trên PC); ALB → EC2 dùng HTTP trong VPC. Có HTTPS: `COOKIE_SECURE=true`, `__Host-sid`, `HSTS_ENABLED=true`. Chỉ đổi biến môi trường, không đổi mã.
- **Header:** `helmet`, CSP `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`; `nosniff`; `Referrer-Policy: no-referrer`; HSTS chỉ khi bật. JSON `/api` có `Cache-Control: no-store`. FE không dùng inline script hay CDN.
- **Log:** pino `redact` gồm `req.headers.cookie`, `res.headers["set-cookie"]`, `req.body.password`; không log body multipart; log `userId`, không log email.

### A5.9 Xác thực công cụ developer local

Công cụ local có tài khoản riêng, không phải bản ghi `users`. Cấp bằng `npm --prefix backend run dev:account -- ten_cua_ban` (mật khẩu ngẫu nhiên in một lần; `--reset` để cấp lại). `backend/tmp/developer-account.json` chỉ giữ username/salt/hash scrypt, được Git bỏ qua và Vite chặn phục vụ.

- Trình duyệt gọi `/__local/backend/*` qua Vite; controller :3001 kiểm phiên cho cả đọc trạng thái/log và start/stop.
- Cookie HttpOnly, SameSite=Strict, Path=/__local/backend, tối đa 8 giờ; giới hạn 5 lần đăng nhập/phút; vẫn dùng được khi Express/MySQL tắt.
- Launcher/CLI dùng capability trong file local. Toàn bộ chỉ đăng ký trong development, không có trong artifact production.

### A5.10 Ranh giới bảo mật

| Ranh giới | Mối đe doạ | Cơ chế |
|---|---|---|
| Internet → ALB | Nghe lén cookie | HTTPS + `Secure` |
| Trình duyệt → API (ghi) | CSRF | Header + `Origin` + SameSite (§A5.4) |
| Trình duyệt → API (danh tính) | Đánh cắp/giả mạo phiên | Token 256 bit, DB chỉ lưu hash, HttpOnly, xoay phiên, hết hạn cố định |
| API → tài liệu / danh sách | Truy cập trái phép, lộ Private | `requireAuth` + policy trước khi đọc body; lọc ở SQL |
| Upload / download | Tệp giả, path traversal, XSS | Giới hạn, chữ ký nội dung, key do server sinh, `attachment` + `nosniff` + CSP |
| App → S3 / RDS | Lộ credentials, truy cập DB từ ngoài | IAM Role + IMDSv2; private subnet + SG + TLS |
| Đăng nhập / redirect / iframe | Dò mật khẩu, open redirect, clickjacking | Rate limit, `safeRedirect`, `frame-ancestors 'none'` |
| Admin local | Lộ công cụ quản trị ra Internet | Tiến trình riêng, chỉ loopback, token + phiên developer (§A12.2) |

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
| Key | `documents/{documentId}/{objectId}.{ext}`, `objectId` = UUID mới mỗi lần ghi |
| Cách ghi | `lib-storage` `Upload` với `Body = fs.createReadStream(tmpPath)` |
| S3 (M5) | Block Public Access; Object Ownership = BucketOwnerEnforced; SSE-S3; **tắt versioning** (nếu bật, DeleteObject chỉ tạo delete marker, trái BR-08); lifecycle huỷ multipart dở sau 1 ngày |
| SeaweedFS (local) | Bucket do `npm --prefix backend run storage:init` tạo; truy cập cần key trong `docker/seaweedfs/s3.json` |

### A6.3 Upload (API-10)

| Bước | Hành động | Nếu lỗi |
|---|---|---|
| U1 | CSRF, session, `requireAuth` | 403 / 401; body chưa được đọc |
| U2 | multer ghi đúng 1 tệp vào `UPLOAD_TMP_DIR/<uuid>` | > 52 428 800 → 413; > 1 tệp → 400 `TOO_MANY_FILES` |
| U3 | Validate `title`, `description`, `visibility` | 400; xoá tệp tạm |
| U4 | FileInspector | 415 / 400 `EMPTY_FILE`; xoá tệp tạm |
| U5 | Sinh `documentId` và key; PutObject | 503 `STORAGE_UNAVAILABLE`; không có bản ghi |
| U6 | INSERT `documents`, `file_version = 1` | Lỗi DB: thử DeleteObject(key), ném lại lỗi gốc |
| U7 | Xoá tệp tạm (finally); 201 `DocumentDto` | Xoá tạm lỗi: dọn ở lần khởi động sau |

### A6.4 FileInspector

| # | Quy tắc | Lỗi |
|---|---|---|
| 1 | `sizeBytes == 0` | 400 `EMPTY_FILE` |
| 2 | Đuôi (chữ thường, sau khi làm sạch tên) ∈ {`pdf`, `docx`, `pptx`} | 415 |
| 3 | PDF: 5 byte đầu là `%PDF-` | 415 |
| 4 | DOCX/PPTX: 4 byte đầu `PK\x03\x04`; đọc central directory bằng `yauzl` (không giải nén, ≤ 10 000 entry); phải có `[Content_Types].xml` **và** `word/document.xml` / `ppt/presentation.xml`; ZIP hỏng → từ chối | 415 |
| 5 | `mimeType` suy từ `fileType`; bỏ qua `Content-Type` client gửi | — |
| 6 | Làm sạch tên: giải mã UTF-8 → basename → bỏ ký tự điều khiển và `"` → NFC → trim → cắt ≤ 255 (giữ đuôi) → rỗng thì `tai-lieu.<ext>` | — |

### A6.5 Download (API-13)

`requireAuth` → loader + `canView` → `getObject(storage_key)` → gửi header → `body.pipe(res)`; client ngắt thì `body.destroy()`. Lỗi **trước** header: `UNAVAILABLE` → 503; `NOT_FOUND` → 503 + log ERROR `download.object_missing`. Lỗi **sau** header: `res.destroy()` + log. Không hỗ trợ `Range`.

### A6.6 Thay thế tệp (API-12)

CSRF → auth → loader + `canManage` trước khi đọc body → multer + FileInspector → PutObject(newKey) → `UPDATE … SET <cột tệp>, file_version = file_version + 1 WHERE id = ?` → thử DeleteObject(oldKey) → 200. Không ghi title, description, visibility. PutObject lỗi → 503, vẫn trỏ oldKey. UPDATE lỗi → thử xoá newKey rồi ném lỗi gốc; 0 dòng → thử xoá newKey, 404. Hai lần thay đồng thời: lần ghi sau thắng.

### A6.7 Xoá vĩnh viễn (API-14)

CSRF → auth → `canManage` → DELETE `documents` (lấy key của dòng vừa xoá) → thử DeleteObject(key) → 204. DB lỗi → giữ nguyên object; không còn dòng → 404. Xoá object lỗi vẫn 204 vì tài liệu đã biến mất khỏi DB.

### A6.8 Dọn dẹp lúc khởi động

Không bảng task, guard, retry hay worker. Khi server khởi động: dọn `UPLOAD_TMP_DIR`, xoá phiên hết hạn theo lô, xoá audit quá hạn (§A12.7).

### A6.9 Ma trận lỗi

| Điểm lỗi | `documents` | Object | HTTP / phục hồi |
|---|---|---|---|
| Upload PutObject lỗi | Không có | Có thể có phần dư | 503 |
| Upload INSERT lỗi | Không có | Thử xoá key mới | Lỗi DB gốc; xoá lỗi → `storage.orphan` |
| Crash sau PutObject | Không có | Có thể mồ côi | Xử lý thủ công |
| Replace PutObject lỗi | Trỏ key cũ | Tệp cũ nguyên vẹn | 503 |
| Replace UPDATE 0 dòng / lỗi | Không đổi | Thử xoá key mới | 404 / lỗi DB gốc |
| Replace xoá key cũ lỗi | Trỏ key mới | Key cũ mồ côi | 200 + `storage.orphan` |
| Delete DB lỗi | Còn nguyên | Còn nguyên | 500 |
| Delete object lỗi | Đã xoá | Key mồ côi | 204 + `storage.orphan` |
| Download object mất | Có | Không có | 503 + ERROR `download.object_missing` |

## A7. REST API Contract

> **Nguồn sự thật duy nhất**, hợp đồng phiên bản **1.0**. Backend trả đúng các trường dưới đây; frontend không giả định thêm trường nào. Contract test: `backend/test/integration/contract.test.ts`.

### A7.1 Quy ước chung

| Chủ đề | Quy ước |
|---|---|
| Phiên bản | Không đặt version trong URL; SPA và API luôn triển khai cùng artifact |
| Base path | `/api`, tương đối, cùng origin |
| Định dạng | JSON UTF-8; trừ API-13 (nhị phân) và 204 (không body) |
| Tên trường | `camelCase`; enum viết HOA (`PUBLIC`, `PDF`), riêng `sort` viết thường (`newest`, `title`) |
| ID | UUID v4 chữ thường; `{id}` sai định dạng → 404 `DOCUMENT_NOT_FOUND` |
| Thời gian | ISO 8601 UTC có mili giây, ví dụ `"2026-10-20T08:30:00.000Z"` |
| Null và thiếu trường | Response: mọi trường **luôn có mặt**, nullable mang `null`. PATCH: bỏ qua = không đổi; `description: null` hoặc `""` = xoá mô tả |
| Trường lạ | Body JSON / multipart có trường lạ → 400 `UNKNOWN_FIELD`; query param lạ bị bỏ qua |
| Độ dài chuỗi | Theo Unicode code point (`[...s].length`) |
| Header | POST/PUT/PATCH/DELETE bắt buộc `X-CSRF-Protection: 1`. Response luôn có `X-Request-Id`; JSON có `Cache-Control: no-store` |
| Giới hạn | JSON ≤ 16 KB (413 `PAYLOAD_TOO_LARGE`). Multipart: đúng 1 part tệp ≤ 52 428 800 byte (413 `FILE_TOO_LARGE`); tối đa 5 part văn bản, mỗi part ≤ 16 KB |
| Thứ tự route | `/api/documents/mine` đăng ký **trước** `/api/documents/:id` |

### A7.2 Envelope

Thành công (2xx, trừ 204): `{ "data": … }`. Lỗi (API-13 đã bắt đầu stream thì không gửi được JSON):

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

`code`: FE rẽ nhánh theo trường này. `message`: tiếng Việt, fallback. `details`: **luôn có**, `[]` khi không có chi tiết. `requestId`: trùng header `X-Request-Id`.

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
| `PAYLOAD_TOO_LARGE` | 413 | JSON / part văn bản > 16 KB | Dữ liệu gửi lên quá lớn. |
| `FILE_TOO_LARGE` | 413 | Tệp > 52 428 800 byte | Tệp vượt quá dung lượng tối đa 50 MB. |
| `UNSUPPORTED_FILE_TYPE` | 415 | Không phải PDF/DOCX/PPTX hợp lệ | Chỉ hỗ trợ tệp PDF, DOCX, PPTX. |
| `RATE_LIMITED` | 429 | Vượt giới hạn (kèm `Retry-After`) | Bạn thao tác quá nhanh. Vui lòng thử lại sau. |
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước | Đã có lỗi xảy ra. Vui lòng thử lại. |
| `STORAGE_UNAVAILABLE` | 503 | Object storage lỗi/không phản hồi | Kho lưu trữ tệp tạm thời không khả dụng. Vui lòng thử lại sau. |
| `SERVICE_UNAVAILABLE` | 503 | API-02: một thành phần phụ thuộc lỗi | Dịch vụ chưa sẵn sàng. |

Mã chỉ có ở client: `NETWORK_ERROR` (`status = 0`), `ABORTED` (người dùng huỷ upload). Mã lỗi của admin local ở §A12.5.

`ValidationIssue.issue` ∈ `REQUIRED`, `INVALID_TYPE`, `INVALID_FORMAT`, `TOO_SHORT`, `TOO_LONG`, `OUT_OF_RANGE`, `INVALID_ENUM`, `UNKNOWN_FIELD`, `EMPTY_FILE`, `TOO_MANY_FILES`, `NO_CHANGES`, `UNAVAILABLE`. `field` là tên trường, `"body"` (vd. `NO_CHANGES`), hoặc `database`/`storage` với `SERVICE_UNAVAILABLE`.

**Lỗi chung, không nhắc lại ở từng endpoint:** 500 `INTERNAL_ERROR`; request ghi thêm 403 `CSRF_REJECTED`; body JSON thêm 400 `INVALID_JSON` và 413 `PAYLOAD_TOO_LARGE`.

### A7.4 Schema dùng chung

**`UserDto`** (chỉ trả cho chính người dùng): `id` · `email` (chữ thường) · `displayName` · `createdAt`. **`OwnerDto`**: `{ id, displayName }`, không bao giờ có email.

**`DocumentDto`**

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `id` | string UUID | |
| `title` | string | |
| `description` | string \| **null** | |
| `visibility` | `"PUBLIC" \| "PRIVATE"` | |
| `fileType` | `"PDF" \| "DOCX" \| "PPTX"` | |
| `originalFilename` | string | Tên đã làm sạch |
| `sizeBytes` | integer | 1…52 428 800 |
| `fileVersion` | integer | Từ 1, tăng khi thay tệp |
| `owner` | `OwnerDto` | |
| `isOwner` | boolean | Guest luôn `false` |
| `createdAt` / `updatedAt` / `fileUpdatedAt` | string ISO | `updatedAt` đổi khi sửa metadata hoặc thay tệp; `fileUpdatedAt` chỉ khi thay tệp |

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

**`Page<T>`**: `items` · `page` ≥ 1 · `pageSize` 1–50 · `totalItems` · `totalPages` = `ceil(totalItems / pageSize)` (`0` khi rỗng). **`ValidationIssue`**: `{ field, issue, message }`.

### A7.5 Quy tắc validate

| Trường | Dùng ở | Quy tắc | `issue` khi sai |
|---|---|---|---|
| `email` | API-04, 05 | Trim → chữ thường; 3–254; định dạng email | `REQUIRED`, `INVALID_TYPE`, `TOO_LONG`, `INVALID_FORMAT` |
| `password` | API-04 | 8–128; không trim | `REQUIRED`, `TOO_SHORT`, `TOO_LONG` |
| `password` | API-05 | 1–128 (không lộ chính sách) | `REQUIRED`, `TOO_LONG` |
| `displayName` | API-04 | Trim; 1–100; không ký tự điều khiển | `REQUIRED`, `TOO_LONG`, `INVALID_FORMAT` |
| `title` | API-10, 11 | Trim; 1–200; không ký tự điều khiển (kể cả `\r`, `\n`) | `REQUIRED`, `TOO_SHORT`, `TOO_LONG`, `INVALID_FORMAT` |
| `description` | API-10, 11 | string \| null; trim; 0–2000; `""` → `null`; cho phép `\n`, `\r`, `\t` | `INVALID_TYPE`, `TOO_LONG`, `INVALID_FORMAT` |
| `visibility` | API-10 (bắt buộc), 11 | `PUBLIC` \| `PRIVATE` | `REQUIRED`, `INVALID_ENUM` |
| `file` | API-10, 12 | Đúng 1 part `file`; 1…52 428 800 byte; nội dung theo §A6.4 | `REQUIRED`, `TOO_MANY_FILES`, `EMPTY_FILE`; 413; 415 |
| `q` | API-07, 08 | Trim; 0–100; rỗng = không lọc | `TOO_LONG` |
| `fileType` | API-07, 08 | `PDF` \| `DOCX` \| `PPTX` | `INVALID_ENUM` |
| `visibility` (lọc) | API-08 | `PUBLIC` \| `PRIVATE`; bỏ qua = tất cả | `INVALID_ENUM` |
| `sort` | API-07, 08 | `newest` (mặc định) \| `title` | `INVALID_ENUM` |
| `page` / `pageSize` | API-07, 08 | 1–10 000 (mặc định 1) / 1–50 (mặc định 12) | `INVALID_TYPE`, `OUT_OF_RANGE` |

### A7.6 Tìm kiếm, sắp xếp, phân trang

- `q` khớp **chuỗi con** trong `title` hoặc `description` (`LIKE '%q%' ESCAPE '\\'`), không phân biệt hoa thường/dấu theo collation. Backend escape `\`, `%`, `_`.
- `sort=newest`: `created_at DESC, id DESC`; `sort=title`: `title ASC, id ASC`.
- `page > totalPages` → 200 với `items: []` và tổng đúng.
- API-07 luôn có `visibility='PUBLIC'`; API-08 luôn có `owner_id = <người gọi>`.

### A7.7 Endpoint

| ID | Method · Path | Quyền | CSRF | Thành công | Lỗi đặc thù |
|---|---|---|---|---|---|
| API-01 | `GET /api/health` | Công khai | — | 200 `{ status: "ok", instanceId, version, uptimeSeconds }` | — (không chạm DB/storage) |
| API-02 | `GET /api/health/ready` | Công khai | — | 200 `{ status: "ready", instanceId, checks: { database, storage } }` | 503 `SERVICE_UNAVAILABLE` + `details` theo thành phần |
| API-03 | `GET /api/auth/me` | Cookie tuỳ chọn | — | 200 `{ user: UserDto \| null }` | **Không bao giờ 401**; cookie hỏng → `null` + xoá cookie |
| API-04 | `POST /api/auth/register` | Công khai | có | 201 `{ user }` + `Set-Cookie` | 400; 409 `EMAIL_ALREADY_EXISTS`; 429 |
| API-05 | `POST /api/auth/login` | Công khai | có | 200 `{ user }` + `Set-Cookie` | 400; 401 `INVALID_CREDENTIALS`; 429 |
| API-06 | `POST /api/auth/logout` | Cookie tuỳ chọn | có | 204 + xoá cookie | — (idempotent) |
| API-07 | `GET /api/documents` | Công khai | — | 200 `Page<DocumentDto>` chỉ Public | 400 |
| API-08 | `GET /api/documents/mine` | User | — | 200 `Page<DocumentDto>`, mọi item `isOwner: true` | 401; 400 |
| API-09 | `GET /api/documents/{id}` | `canView` | — | 200 `DocumentDto` | 404 |
| API-10 | `POST /api/documents` | User | có | 201 `DocumentDto` + `Location`; `fileVersion = 1` | 401; 400; 413; 415; 503 |
| API-11 | `PATCH /api/documents/{id}` | `canManage` | có | 200 `DocumentDto`; trường tệp giữ nguyên | 401; 403; 404; 400 (`{}` → `body`/`NO_CHANGES`; `title: null` → `INVALID_TYPE`) |
| API-12 | `PUT /api/documents/{id}/file` | `canManage` trước khi đọc body | có | 200 `DocumentDto`, `fileVersion` + 1; metadata/visibility giữ nguyên | 401; 403; 404; 400; 413; 415; 503 |
| API-13 | `GET /api/documents/{id}/download` | User + `canView` | — | 200 nhị phân, `attachment` | 401; 404; 503 trước khi stream |
| API-14 | `DELETE /api/documents/{id}` | `canManage` | có | 204, kể cả khi xoá object lỗi | 401; 403; 404 |

**Ghi chú:**
- API-01: `instanceId` = `INSTANCE_ID` hoặc `os.hostname()`. API-02 kiểm `SELECT 1` và `HeadBucket`, mỗi kiểm tra timeout 2 s.
- API-07 nhận phiên (nếu có) chỉ để tính `isOwner`.
- API-10: `multipart/form-data`, part `title` (bắt buộc), `description`, `visibility` (bắt buộc), `file` (đúng 1); nên gửi part văn bản trước `file`.
- API-12: chỉ part `file` (part khác → 400 `UNKNOWN_FIELD`). Khi từ chối 401/403/404 trước khi đọc body, backend trả `Connection: close` và xả body; FE vẫn phải xử lý `NETWORK_ERROR`.

```http
POST /api/auth/register
Content-Type: application/json
X-CSRF-Protection: 1

{ "email": "SV.A@example.com ", "password": "matkhau123", "displayName": "Nguyễn Văn A" }
```

→ `201 { "data": { "user": { "id": "9a1c7d42-…", "email": "sv.a@example.com", "displayName": "Nguyễn Văn A", "createdAt": "2026-10-20T08:00:00.000Z" } } }`

```bash
curl -X POST http://localhost:3000/api/documents -H "X-CSRF-Protection: 1" -b "sid=<token>" \
  -F "title=Đề cương Giải tích 1" -F "description=Tổng hợp công thức chương 1–3" \
  -F "visibility=PUBLIC" -F "file=@Đề cương Giải tích 1.pdf;type=application/pdf"
```

Header của API-13:

```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Length: 1048576
Content-Disposition: attachment; filename="De cuong Giai tich 1.pdf"; filename*=UTF-8''%C4%90%E1%BB%81%20c%C6%B0%C6%A1ng%20Gi%E1%BA%A3i%20t%C3%ADch%201.pdf
Cache-Control: private, no-store
X-Content-Type-Options: nosniff
```

`filename` ASCII: bỏ dấu (NFD), `đ/Đ` → `d/D`, ký tự ngoài ASCII → `_`, bỏ `"` và `\`. `filename*`: `encodeURIComponent` + mã hoá thêm `'()*`.

## A8. Frontend UX/UI

### A8.1 Nguyên tắc

- Tên **"Kho Tài Liệu Học Tập"**, `<html lang="vi">`. Thuật ngữ: **Tải lên**, **Tải xuống**, **Công khai**, **Riêng tư**, **Tài liệu của tôi**.
- CSS Modules + token trong `styles/tokens.css`: nền sáng nâu taupe / trắng kem / xanh sage (paper `#f6f3ed`, accent `#c4d0bd`, primary `#6a584c`); breakpoint 640/1024 px.
- Mọi khối dữ liệu có 4 trạng thái: đang tải / thành công / rỗng / lỗi. **URL là nguồn sự thật** cho bộ lọc và trang của P-01, P-05.
- Form validate khi blur và khi gửi; lỗi server (`details`) gắn vào đúng trường; gửi lỗi thì focus trường lỗi đầu tiên.
- Dùng được từ 360 px, không cuộn ngang; vùng bấm ≥ 44 px; landmark + một `h1` mỗi trang + skip link; nhãn không chỉ dùng màu; dialog giữ focus, Esc để đóng; toast `role="status"`, alert lỗi `role="alert"`; kiểm bằng axe và bàn phím (`test:ui`).
- Khi backend mất kết nối: giữ bản nháp/tệp đã chọn; khoá thao tác cần server; không tự gửi lại upload hay mutation.

### A8.2 Route và điều hướng

| Page | Route | Guard | Nội dung | API |
|---|---|---|---|---|
| P-01 Khám phá | `/` | — | SearchBar (`q`, `fileType`, `sort`), lưới thẻ Public, phân trang 12/trang | API-07; tải xuống API-03 + 13 |
| P-02 Đăng nhập | `/login` | GuestOnly | Email, mật khẩu; quay lại `redirect` an toàn | API-05 |
| P-03 Đăng ký | `/register` | GuestOnly | Tên hiển thị, email, mật khẩu, nhập lại; chỉ báo độ mạnh mật khẩu (E6) | API-04 |
| P-04 Chi tiết | `/documents/:id` | — | Metadata; tải xuống / "Đăng nhập để tải xuống"; sửa, xoá nếu owner | API-09, 13, 14 |
| P-05 Tài liệu của tôi | `/me/documents` | RequireAuth | Bảng (≥ 640 px) hoặc thẻ; lọc chế độ/loại; tải, sửa, xoá | API-08, 13, 14 |
| P-06 Tải lên | `/upload` | RequireAuth | Chọn/kéo thả tệp, tiêu đề tự điền, mô tả, chọn chế độ (không chọn sẵn), tiến độ, huỷ | API-10 |
| P-07 Chỉnh sửa | `/documents/:id/edit` | RequireAuth | Sửa thông tin; thay tệp; xoá | API-09, 11, 12, 14 |
| P-08 Không tìm thấy | `*` | — | Trang 404 | — |
| Admin | `/admin/*` | Đăng nhập developer | Chỉ khi có thư mục admin, chỉ dev (§A12) | ADM-xx |

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

### A8.3 Trạng thái theo xác thực

| `AuthProvider` | Header | `RequireAuth` | `GuestOnly` |
|---|---|---|---|
| `loading` (đang gọi API-03) | Khung xám | Spinner | Spinner |
| `ready`, `user = null` | Khám phá · Đăng nhập · Đăng ký | `<Navigate to="/login?redirect=…">` | Hiện trang |
| `ready`, có `user` | Khám phá · Tài liệu của tôi · Tải lên · tên · Đăng xuất | Hiện trang | `<Navigate to="/me/documents">` |

- Nút Tải xuống: Guest thấy link "Đăng nhập để tải xuống"; User thấy nút. `useDownload` gọi API-03 trước, còn phiên thì điều hướng link API-13. Chỉnh sửa/Xoá chỉ hiện khi `isOwner`.
- Hết phiên giữa chừng: `api/*` phát `auth:unauthorized` khi 401 `UNAUTHENTICATED` → Guest + toast + tới login nếu đang ở route cần đăng nhập.
- `safeRedirect` chỉ nhận đường dẫn bắt đầu bằng `/`, không bắt đầu bằng `//` hoặc `/\`; còn lại dùng `/me/documents`.

### A8.4 Validate phía client và hiển thị lỗi

Quy tắc khớp §A7.5; `MAX_UPLOAD_BYTES = 52_428_800` và danh sách đuôi ở `lib/constants.ts`. Thông điệp ví dụ: "Vui lòng nhập email.", "Mật khẩu tối thiểu 8 ký tự.", "Mật khẩu nhập lại không khớp.", "Tiêu đề không được chứa ký tự xuống dòng.", "Vui lòng chọn chế độ hiển thị.", "Chỉ hỗ trợ tệp PDF, DOCX, PPTX.", "Tệp vượt quá dung lượng tối đa 50 MB.".

| `code` | Hiển thị |
|---|---|
| `UNAUTHENTICATED` | Xử lý toàn cục §A8.3 |
| `INVALID_CREDENTIALS`, `RATE_LIMITED` | Alert trên form P-02/P-03 |
| `EMAIL_ALREADY_EXISTS` | Lỗi trường Email |
| `VALIDATION_ERROR` | Lỗi theo trường; không map được → Alert với `message` |
| `FORBIDDEN`, `DOCUMENT_NOT_FOUND` | Thông báo tại P-04/P-07; trong danh sách → toast + tải lại |
| `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE` | Lỗi trường Tệp |
| `CSRF_REJECTED`, `PAYLOAD_TOO_LARGE`, `INVALID_JSON`, `STORAGE_UNAVAILABLE` | Alert với `message` |
| `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`, mã lạ | "Đã có lỗi xảy ra. Vui lòng thử lại." + "Mã yêu cầu: {requestId}" |
| `NETWORK_ERROR` / `ABORTED` | "Không thể kết nối máy chủ…" / "Đã huỷ tải lên." |

### A8.5 Hộp thoại xác nhận

| ID | Khi nào | Nội dung | Nút |
|---|---|---|---|
| CD-01 | Xoá (P-04, P-05, P-07) | Tài liệu "{title}" và tệp đính kèm sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác. | "Huỷ" (focus mặc định) · "Xoá vĩnh viễn" |
| CD-02 | Thay tệp (P-07) | Tệp "{originalFilename}" sẽ được thay bằng "{tên mới}". Chế độ hiển thị và thông tin giữ nguyên. | "Huỷ" · "Thay thế" |
| CD-03 | Riêng tư → Công khai (P-07) | Mọi người sẽ tìm thấy tài liệu này và người đã đăng nhập có thể tải xuống. | "Huỷ" · "Chuyển sang Công khai" |

Huỷ → không gọi API, không thay đổi gì.

## A9. Sơ đồ tuần tự

### SEQ-01 — Đăng ký / đăng nhập / đăng xuất

```mermaid
sequenceDiagram
  autonumber
  actor U as Guest
  participant FE as Frontend
  participant BE as Backend
  participant DB as MySQL
  U->>FE: Điền form đăng ký
  FE->>BE: POST /api/auth/register, X-CSRF-Protection 1
  BE->>BE: csrfGuard, rate limit, validate, chuẩn hoá email, băm argon2id
  BE->>DB: Transaction INSERT users và INSERT sessions
  alt Email đã tồn tại
    BE-->>FE: 409 EMAIL_ALREADY_EXISTS
  else Thành công
    BE-->>FE: 201 user và Set-Cookie sid HttpOnly
    FE-->>U: Chuyển tới /me/documents
  end
  U->>FE: Đăng nhập lần sau
  FE->>BE: POST /api/auth/login
  BE->>DB: SELECT users WHERE email
  BE->>BE: argon2 verify, dùng hash giả nếu không có email
  alt Sai email hoặc mật khẩu
    BE-->>FE: 401 INVALID_CREDENTIALS
  else Đúng
    BE->>DB: DELETE phiên cũ theo cookie nếu có, INSERT sessions
    BE-->>FE: 200 user và Set-Cookie
  end
  U->>FE: Bấm Đăng xuất
  FE->>BE: POST /api/auth/logout
  BE->>DB: DELETE sessions WHERE id là SHA-256 của cookie
  BE-->>FE: 204 và cookie Max-Age 0
```

### SEQ-02 — Tải lên, gồm luồng lỗi

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant BE as Backend
  participant DB as MySQL
  participant OS as Object storage
  FE->>BE: POST /api/documents multipart, XHR có tiến độ
  BE->>BE: CSRF, requireAuth, multer ghi tệp tạm, validate, FileInspector
  BE->>OS: PutObject newKey
  alt Storage lỗi
    OS--xBE: Lỗi
    BE-->>FE: 503 STORAGE_UNAVAILABLE, không INSERT
  else Storage OK
    BE->>DB: INSERT documents, file_version 1
    alt DB lỗi
      DB--xBE: Lỗi
      BE->>OS: DeleteObject newKey best-effort
      Note over BE,OS: Xoá lỗi thì WARN storage.orphan kèm storageKey
      BE-->>FE: Lỗi DB gốc
    else DB OK
      BE-->>FE: 201 DocumentDto
    end
  end
```

### SEQ-03 — Tải xuống

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
  alt Không có phiên hoặc phiên hết hạn
    BE-->>FE: 200 user là null
    FE-->>U: Chuyển tới /login?redirect=trang hiện tại
  else Phiên hợp lệ
    BE-->>FE: 200 user
    FE->>BE: Trình duyệt điều hướng thẻ a ẩn tới /api/documents/id/download
    BE->>DB: Nạp phiên, SELECT documents WHERE id
    BE->>BE: requireAuth, canView trả ALLOW
    BE->>OS: GetObject storage_key
    alt Storage lỗi trước khi gửi header
      BE-->>FE: 503 STORAGE_UNAVAILABLE dạng JSON
    else Thành công
      OS-->>BE: Stream và ContentLength
      BE-->>FE: 200 Content-Disposition attachment, stream byte
    end
  end
```

### SEQ-04 — Thay thế tệp và xoá

```mermaid
sequenceDiagram
  participant FE as Frontend
  participant BE as Backend
  participant DB as MySQL
  participant OS as Object storage
  Note over FE,OS: Thay thế tệp, canManage chạy trước khi đọc body
  FE->>BE: PUT /api/documents/id/file
  BE->>OS: PutObject newKey
  alt Storage lỗi
    BE-->>FE: 503, tài liệu vẫn trỏ oldKey
  else Storage OK
    BE->>DB: UPDATE cột tệp, file_version + 1 WHERE id
    alt 0 dòng hoặc lỗi DB
      BE->>OS: DeleteObject newKey best-effort
      BE-->>FE: 404 nếu 0 dòng, hoặc lỗi DB gốc
    else 1 dòng
      BE->>OS: DeleteObject oldKey best-effort
      BE-->>FE: 200 DocumentDto, visibility giữ nguyên
    end
  end
  Note over FE,OS: Xoá vĩnh viễn
  FE->>BE: DELETE /api/documents/id
  BE->>DB: DELETE documents WHERE id, lấy storageKey
  alt DB lỗi
    BE-->>FE: 500, không đụng object
  else DB OK
    BE->>OS: DeleteObject key best-effort
    BE-->>FE: 204 kể cả khi xoá object lỗi
  end
```

## A10. Local và AWS

### A10.1 Local: cổng, URL, Docker Compose

| Thành phần | Địa chỉ |
|---|---|
| Frontend dev (Vite, proxy `/api` → `:3000`) | `http://localhost:5173` |
| Backend API / production-like (`SERVE_FRONTEND=true`) | `http://localhost:3000/api` / `http://localhost:3000` |
| Controller local | `127.0.0.1:3001`, chỉ qua cầu nối Vite/launcher |
| Admin local (nếu có thư mục admin) | `127.0.0.1:3003`, chỉ qua controller |
| Backend thứ 2 (thử stateless) | `http://localhost:3002` |
| MySQL | `localhost:3306`, DB `btl_cloud` / `btl_cloud_test`, user `btl` |
| SeaweedFS S3 API | `http://localhost:9000` |

| Service | Image | Cấu hình | Volume · Healthcheck |
|---|---|---|---|
| `mysql` | `mysql:8.4` | `MYSQL_DATABASE=btl_cloud`, `MYSQL_USER=btl`, `MYSQL_PASSWORD=btl_dev_password`; mount `docker/mysql/init` | `mysql-data` · `mysqladmin ping` |
| `seaweedfs` | `chrislusf/seaweedfs:4.48` | `server -dir=/data -master.volumeSizeLimitMB=1024 -volume.max=100 -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json`; cổng `9000:8333`; key `minioadmin` / `minioadmin-dev` | `seaweedfs-data` · `cluster/status` |

Compose không tạo bucket: chạy `npm --prefix backend run storage:init`. `01-init.sql` tạo `btl_cloud_test` và cấp quyền cho `btl` (Prisma cần tạo shadow DB). Mật khẩu trên là **giá trị dev công khai**; MinIO không còn image miễn phí nên dùng SeaweedFS (CR-001), tên key `minioadmin` giữ để `.env.example` không đổi.

### A10.2 Biến môi trường backend

`backend/.env.example` được commit; `backend/.env` trong `.gitignore`. Giới hạn upload là hằng số trong mã, không phải biến môi trường.

| Biến | Dev (`.env.example`) | Test | AWS (chốt ở M5) |
|---|---|---|---|
| `NODE_ENV` | `development` | `test` | `production` |
| `PORT` / `HOST` | `3000` / (không đặt) | Supertest dùng app trực tiếp | `3000` |
| `DATABASE_URL` | `mysql://btl:btl_dev_password@localhost:3306/btl_cloud` | `…/btl_cloud_test` | endpoint RDS, TLS |
| `S3_BUCKET` | `btl-cloud-documents` | `btl-cloud-documents-test` | tên bucket ở M5 |
| `S3_REGION` | `us-east-1` | `us-east-1` | `us-east-1` |
| `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` | `http://localhost:9000` / `true` | như dev | *(trống)* / `false` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `minioadmin` / `minioadmin-dev` | như dev | **không đặt**: SDK lấy credentials từ IAM Role |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000,http://localhost:3001` | `http://localhost:5173` | origin công khai |
| `SESSION_COOKIE_NAME` | `sid` | `sid` | `__Host-sid` (HTTPS) / `sid` |
| `COOKIE_SECURE` / `HSTS_ENABLED` | `false` / `false` | `false` / `false` | `true` / `true` nếu HTTPS |
| `SESSION_TTL_HOURS` | `168` | `168` | `168` |
| `TRUST_PROXY` | `false` | `false` | `1` |
| `UPLOAD_TMP_DIR` | `./tmp/uploads` | thư mục tạm của OS | `/var/lib/btl-cloud/tmp` (EBS) |
| `AUTH_RATE_LIMIT_MAX` | `20` | `1000` | `20` |
| `LOG_LEVEL` | `debug` | `silent` | `info` |
| `SERVE_FRONTEND` / `FRONTEND_DIST_DIR` | `false` / `../frontend/dist` | `false` | `true` / `/opt/btl-cloud/frontend/dist` |
| `INSTANCE_ID` | *(trống → hostname)* | — | *(trống → hostname)* |
| `AUDIT_RETENTION_DAYS` | `90` | — | `90` |

### A10.3 Frontend: proxy và build

`vite.config.ts`: cổng 5173 (`strictPort`), `proxy['/api'] → http://localhost:3000`. Frontend **không có biến môi trường**. `build` = `tsc -b && vite build` → `frontend/dist/`.

### A10.4 Timeout và giới hạn (kiểm chứng ở M5)

| Thành phần | Giá trị | Lý do |
|---|---|---|
| Node `server.requestTimeout` | 900 000 ms | Upload 50 MB qua mạng chậm |
| Node `keepAliveTimeout` / `headersTimeout` | 125 000 / 126 000 ms | Lớn hơn ALB idle timeout để tránh 502 |
| ALB idle timeout / deregistration delay | 120 s / 60 s | Đủ cho PutObject sau khi nhận tệp và cho scale-in |
| Graceful shutdown / readiness check | ≤ 30 s / 2 s mỗi kiểm tra | |

### A10.5 Khởi động và tắt

Cách chạy chi tiết ở [README](../README.md). Server: load config → chuẩn bị thư mục tạm → dọn tạm/phiên/audit quá hạn → listen. SIGTERM/SIGINT: `server.close()` → chờ request tối đa 30 s → `prisma.$disconnect()` → thoát 0. Backend thứ hai dùng `PORT=3002` (3001 dành cho controller); khi thử ghi qua hai instance, đặt `ALLOWED_ORIGINS` gồm cả `:3000` và `:3002`.

### A10.6 Môi trường test

| Loại | Lệnh | Cần hạ tầng |
|---|---|---|
| Như CI | `npm ci && npm run lint && npm run build && npm test` (root) | Không |
| Backend integration | `npm --prefix backend run test:integration` | MySQL + SeaweedFS, DB/bucket test; chạy tuần tự |
| Launcher/controller | `node --test backend/dev/*.test.mjs` | Không |
| E2E | `npm --prefix frontend run test:e2e` | Stack production-like `:3000` |
| UI mock | `npm --prefix frontend run test:ui` | Không |
| Kiểm chứng | `node scripts/verify/authz-matrix.mjs`, `upload-matrix.mjs` | Stack production-like `:3000` |
| Cô lập admin / host local | `node scripts/verify/admin-isolation.mjs`, `local-production.mjs` | Sau `npm run build` |
| Admin (chỉ máy owner) | `npm --prefix backend exec -- vitest run --config admin/vitest.config.ts` | DB test |

### A10.7 Thiết kế AWS (mục tiêu M5, chưa provisioning)

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
  cw["CloudWatch<br/>metrics, alarms, logs"]
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

| Local | AWS | Thay đổi cấu hình |
|---|---|---|
| MySQL 8.4 | RDS MySQL 8.4 `db.t3.micro` Single-AZ, không public, subnet group 2 private subnet | `DATABASE_URL`, TLS |
| SeaweedFS | S3 private + Gateway Endpoint | `S3_ENDPOINT` trống, tắt path-style, bỏ key → IAM Role |
| Backend `:3000` | EC2 `t3.micro` trong ASG min 2 / desired 2 / max 4, cùng artifact | `SERVE_FRONTEND=true`, `TRUST_PROXY=1` |
| Vite proxy `:5173` | ALB → target group HTTP:3000, health check `/api/health` | SPA do backend phục vụ |
| `backend/tmp/uploads` | EBS gp3 20 GiB mã hoá | `UPLOAD_TMP_DIR` |
| Log console | CloudWatch Logs (nếu OD-06 cho phép) | CloudWatch Agent |
| `backend/.env` | Launch template user data / SSM Parameter Store (OD-07) | — |

- **Stateless:** phiên ở RDS, tệp ở S3, tệp tạm chỉ trong một request; ALB không cần sticky session. Node 24 trên Amazon Linux 2023, chạy bằng systemd (`Restart=always`, user không phải root, `EnvironmentFile`); `prisma migrate deploy` là bước riêng trước rollout.
- **IAM Role** (instance profile, IMDSv2 bắt buộc, không access key):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "DocumentObjects", "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:AbortMultipartUpload"],
      "Resource": "arn:aws:s3:::<DOCUMENT_BUCKET>/documents/*" },
    { "Sid": "BucketReadinessCheck", "Effect": "Allow",
      "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::<DOCUMENT_BUCKET>" }
  ]
}
```

  Gắn thêm tuỳ OD-06/07: `CloudWatchAgentServerPolicy`, `AmazonSSMManagedInstanceCore`, `s3:GetObject` trên bucket artifact, `ssm:GetParameter` + `kms:Decrypt`.

- **Security group:** `sg-alb` nhận 80 (và 443) từ Internet, ra 3000 tới `sg-app`; `sg-app` nhận 3000 **chỉ** từ `sg-alb`, ra 3306 tới `sg-rds` và 443 tới prefix list S3; `sg-rds` nhận 3306 **chỉ** từ `sg-app`. Không mở SSH từ Internet.
- **ALB:** internet-facing trên 2 public subnet; health check `/api/health`, matcher 200, interval 15 s, timeout 5 s, healthy 2 / unhealthy 3; không stickiness.
- **ASG:** launch template AL2023, `t3.micro`, EBS gp3 20 GiB, IMDSv2; min 2 / desired 2 / max 4; health check ELB, grace 300 s; target tracking theo OD-09; triển khai bằng instance refresh.
- **CloudWatch:** metric có sẵn (EC2 CPU; ALB `RequestCount`, `TargetResponseTime`, `HTTPCode_Target_5XX_Count`, `UnHealthyHostCount`; RDS CPU, `FreeStorageSpace`). Alarm đề xuất: CPU ASG > 70% trong 2 × 1 phút; `UnHealthyHostCount ≥ 1` trong 2 phút (**kích hoạt thử** bằng cách dừng service trên một instance); 5XX > 10 trong 5 phút; RDS `FreeStorageSpace < 2 GiB`. Thông báo qua SNS email.

### A10.8 Vấn đề AWS còn mở

| ID | Vấn đề | Phương án |
|---|---|---|
| U-01 | Egress cho EC2 private (OD-06): tải runtime, gửi log, Session Manager | (a) chỉ S3 Gateway Endpoint, artifact + runtime để trên S3 (repo `dnf` AL2023 phục vụ từ S3, cần kiểm chứng); (b) thêm interface endpoint `logs`, `ssm`…: phí theo giờ; (c) NAT Gateway: phí theo giờ + GB, chưa có trong dự toán |
| U-02 | HTTPS (OD-05) | Tên miền + ACM, hoặc chỉ HTTP và ghi nhận rủi ro cookie không mã hoá (ACM không cấp cho `*.elb.amazonaws.com`) |
| U-03 | Mật khẩu RDS (OD-07) | SSM SecureString (cần endpoint/NAT) hoặc user data |
| U-04 | Sẵn sàng | RDS Single-AZ là điểm lỗi đơn, chấp nhận vì chi phí |
| U-05 | Metric scaling (OD-09) | CPU khó tăng vì app chủ yếu chờ I/O; cân nhắc `ALBRequestCountPerTarget` |
| U-06…08 | IPv4 công khai của ALB, burst credit t3, quota tài khoản | Rà soát khi lập dự toán (M5-09) |

## A11. Hạn chế đã chấp nhận

- Object mồ côi có thể còn sau lỗi/crash; lần xoá thất bại tra qua log `storage.orphan`. Không tự thu gom, không lịch sử phiên bản (CR-007).
- Thay tệp đồng thời là last-write-wins; object của lần thay bị ghi đè có thể mồ côi.
- Rate limit trong bộ nhớ, tính theo từng instance.
- Nếu phiên hết hạn đúng giữa lúc FE kiểm API-03 và lúc tải, trình duyệt hiện JSON lỗi.
- Collation có thể không coi "đ" ≡ "d" khi tìm kiếm.
- RDS Single-AZ là điểm lỗi đơn.

## A12. Mở rộng (E1–E8)

> Đã duyệt qua CR-009 và đã triển khai E1–E3, E6–E8 (trạng thái từng task ở [MILESTONES](MILESTONES.md#e1e8--mở-rộng)). **E4–E5 (hồ sơ/avatar, username, bạn bè) hoãn** (XOD-21); thiết kế cũ còn trong lịch sử Git nếu cần làm lại bằng CR mới. Dùng lại quy ước §A1.4, §A5.5, §A6, §A7.1–A7.3; không thêm dịch vụ (Redis, queue, Prometheus…).

### A12.1 Quyết định

| ID | Quyết định | Lý do · đánh đổi |
|---|---|---|
| XD-01 | Admin là tiến trình Node riêng (`backend/admin/main.ts`, chạy bằng `tsx`) trên `127.0.0.1:3003`. Controller chỉ khởi động nó **nếu thư mục tồn tại** | Không có trong bản build · admin có kết nối DB/storage riêng |
| XD-02 | Trình duyệt → Vite `/__local/backend/admin/*` → controller (kiểm phiên developer) → admin (kiểm token) | Dùng lại phiên developer sẵn có |
| XD-03 | `.gitignore` gồm `backend/admin/`, `frontend/src/admin/`, `frontend/admin-tests/`. Mã commit không import admin: controller chỉ `spawn`; frontend nạp bằng `import.meta.glob` | Clone sạch vẫn build · admin không có Git/CI (XR-01) |
| XD-04 | Số liệu hiệu năng đo trong Express, không có endpoint; `express-child.mjs` (chỉ dev) ghi `backend/tmp/metrics-snapshot.json` mỗi 5 s | Không mở cổng mới · trễ tối đa 5 s |
| XD-05 | Mọi sự kiện audit (user và admin) ghi vào **một** bảng `audit_events` | Lọc, phân trang, retention, chạy được nhiều instance |
| XD-06 | Xoá tài khoản: đánh dấu `DELETING` → xoá object rồi bản ghi → xoá user; mọi bước chạy lại an toàn | Thử lại không cần hàng đợi; FK `RESTRICT` chặn xoá user khi còn tài liệu |
| XD-11 | Không thêm cache | Chưa có số đo cho thấy cần (§A12.6) |
| XD-12 | Audit ghi bằng middleware `audited(action)` khi response đóng, không chung transaction, không chờ; lỗi → log ERROR | Một cơ chế cho mọi route |
| XD-13 | Lỗi chẩn đoán là **dòng log Pino sẵn có** thêm `module`, `stage`, `code`; admin đọc file log của controller, không có bảng lỗi | Không thu thập trùng · local chỉ giữ khoảng 2 × 2 MB log |
| XD-14 | Xoá audit quá `AUDIT_RETENTION_DAYS` lúc khởi động backend | Như D-10, không worker |
| XD-15 | E3 đếm trong bộ nhớ, E7 đọc bản ghi; không middleware dùng chung | Hai module độc lập |

### A12.2 Ranh giới admin local ↔ public

```mermaid
flowchart LR
  user["Người dùng Internet"] -->|"HTTPS tunnel hoặc ALB"| pub
  subgraph host["Máy owner"]
    subgraph loop["Chỉ 127.0.0.1"]
      dev["Trình duyệt /admin"] --> vite["Vite :5173"] --> ctrl["Controller :3001"] --> adm["Admin :3003<br/>gitignore"]
    end
    pub["Public app :3000"]
    snap[("metrics-snapshot.json")]
    logf[("local-services.ndjson")]
    db[("MySQL<br/>gồm audit_events")]
    s3[("SeaweedFS")]
  end
  pub --> db
  pub --> s3
  pub -->|"ghi 5 s"| snap
  pub -->|"stdout"| ctrl
  ctrl -->|"ghi log"| logf
  adm -->|"đọc"| snap
  adm -->|"đọc"| logf
  adm --> db
  adm --> s3
```

| Ranh giới | Bảo vệ |
|---|---|
| Internet → `:3000` | Public app không có route admin; `/api/admin/*` → 404; không endpoint nào đọc audit hay log |
| Internet → `:3003` | Chỉ bind `127.0.0.1`; từ chối địa chỉ không phải loopback và header `X-Forwarded-For`; tunnel chỉ trỏ `:3000` |
| Trang web khác → Vite | Kiểm `Host`, `Origin`, `Sec-Fetch-Site`, header `X-Local-Control` |
| Vite → controller → admin | Phiên developer + token ngẫu nhiên 32 byte mỗi lần chạy (env `ADMIN_LOCAL_TOKEN`); controller gửi `X-Admin-Actor` = username developer |
| Admin → AWS | `localConfig()` từ chối DB/S3 không phải loopback và `NODE_ENV=production` |

### A12.3 Module

`commit` = vào repo, chạy CI; `admin` = thư mục gitignore, chỉ trên máy owner. Mũi tên phụ thuộc chỉ đi từ admin sang mã commit.

| ID | Nơi · vị trí | Input → Output | Phụ thuộc | Lỗi |
|---|---|---|---|---|
| XM-01 Activity tracker (E1) | commit · `modules/users/activity-tracker.ts`, gọi từ `sessionLoader` | `userId` → ghi `users.last_active_at` tối đa 1 lần/5 phút (SQL thô, không đổi `updated_at`) | Prisma | Chỉ log, không ảnh hưởng request |
| XM-02 Controller + Vite bridge (E1) | commit · `backend/dev/`, `frontend/dev/` | `/__local/backend/admin/*` → admin; spawn admin nếu có `backend/admin/main.ts` | developer auth, file log | Không có admin → `not-installed`, proxy 404, Start All vẫn chạy; admin tắt → 503 |
| XM-03 Nạp admin ở FE (E1) | commit · `App.tsx`, `AppLayout.tsx` | `import.meta.glob('./admin/AdminApp.tsx')` khi DEV → route `/admin/*` + link "Quản trị" | Vite | Glob rỗng → không có gì |
| XM-04 Trạng thái `DELETING` (E2) | commit · `auth.service.ts`, `document.repository.ts`, `document.loader.ts` | `deletion_started_at ≠ NULL` → không đăng nhập được, phiên vô hiệu, tài liệu 404 và không có trong tìm kiếm | repositories | Dùng mã sẵn có |
| XM-05 Metrics (E3) | commit · `src/metrics/metrics.ts`, `backend/dev/express-child.mjs` | Sự kiện response + mẫu CPU/RAM mỗi 5 s → snapshot JSON (chỉ khi có `BTL_LOCAL_METRICS_FILE`) | `node:os`, `perf_hooks` | Không ném lỗi vào request; ghi file lỗi → bỏ lượt |
| XM-11 Chỉ báo mật khẩu (E6) | commit · `lib/passwordStrength.ts`, `components/PasswordStrengthMeter.tsx` | `password` → `{ level: INVALID \| WEAK \| MEDIUM \| STRONG, criteria }` | Không (hàm thuần) | Không gọi mạng |
| XM-12 Thử tải (E3) | commit · `scripts/load/` | Seed 50 user, 500 tài liệu vào `btl_cloud_load` + bucket `…-load`; lệnh `npx autocannon` | Prisma, ObjectStorage | Từ chối DB khác hoặc không phải loopback |
| XM-13 Audit recorder (E7) | commit · `modules/audit/` | `audited(action)` → một dòng `audit_events` sau khi response đóng | Prisma, `req.id`, `req.auth`, `res.locals.errorCode` | INSERT lỗi → ERROR `audit.write_failed`, response không đổi; khoá `metadata` ngoài allowlist bị bỏ |
| XM-14 Trường log chẩn đoán (E7) | commit · `http/errors.ts`, `error-handler.ts`, `request-context.ts`, `lib/module-of.ts` | Request + lỗi → một dòng JSON có `requestId, module, stage, code, statusCode, durationMs, userId` | pino-http | Thiếu `stage` → `null`; redact giữ nguyên |
| XA-01 Admin process (E1) | admin · `main.ts` | HTTP từ controller → envelope như §A7.2 | `localConfig()`, Prisma, S3ObjectStorage | Sai token / không loopback / có `X-Forwarded-For` → 403; config không loopback → thoát |
| XA-02 Overview (E1, E3) | admin · `overview.ts` | ADM-01 → số user, tài liệu, dung lượng logic và đĩa SeaweedFS, sức khoẻ, metrics | Prisma, ObjectStorage, snapshot | Mỗi phần lỗi độc lập ("Không đo được"); snapshot > 15 s → backend tắt |
| XA-03 Quản lý user (E2) | admin · `users.ts` | ADM-02, 03, 05, 06 | Prisma, XM-13 | 400; 409 `EMAIL_ALREADY_EXISTS`, `ACCOUNT_DELETING`; không trả `passwordHash` |
| XA-04 Xoá tài khoản (E2) | admin · `deletion.ts` | ADM-07 → `COMPLETED` hoặc 503 còn N tài liệu | Prisma, ObjectStorage, XM-13 | Email xác nhận sai → 400; storage lỗi → dừng, bấm lại để tiếp tục |
| XA-05 Admin UI | admin · `frontend/src/admin/` | Trang Dashboard (số liệu, biểu đồ trực tiếp, dịch vụ/log), Users, Activity, Errors, Trực tiếp | XA-01 qua controller | Lỗi API hiện tại chỗ; các trang khác vẫn dùng được |
| XA-06 Activity (E7) | admin · `activity.ts` | ADM-08 → `Page<AuditEventDto>`; 20 sự kiện gần nhất cho ADM-03 | Prisma | DB lỗi → 503 |
| XA-07 Errors, Trực tiếp (E7) | admin · `errors.ts`, `live.ts` | ADM-09, 10, 11, 12 đọc `local-services.ndjson` (+ `.1`) | File log, XA-06 | Không có file → rỗng + "Chưa có log"; dòng hỏng bị bỏ |

Hợp đồng chấm mật khẩu (XM-11):

```ts
const len = [...pw].length;
const criteria = { upper: /\p{Lu}/u.test(pw), special: /[^\p{L}\p{N}]/u.test(pw), long: len > 12 };
const score = Object.values(criteria).filter(Boolean).length;
level = len < 8 ? 'INVALID' : score === 0 ? 'WEAK' : score < 3 ? 'MEDIUM' : 'STRONG';
```

Nhãn: Quá ngắn / Yếu / Trung bình / Mạnh. Chỉ tham khảo: không chặn đăng ký, server vẫn chỉ yêu cầu 8–128 ký tự.

### A12.4 CSDL và migration

| Migration | Thay đổi | Giai đoạn |
|---|---|---|
| `20261030020514_user_last_active` | `users.last_active_at DATETIME(3) NULL` + index | E1 |
| `20261030023011_user_deletion` | `users.deletion_started_at DATETIME(3) NULL` | E2 |
| `20261030023628_audit_events` | Bảng `audit_events`, **không** có FK (sự kiện tồn tại sau khi đối tượng bị xoá) | E7 |

`audit_events`: `id BIGINT UNSIGNED AUTO_INCREMENT PK` · `created_at DATETIME(3)` · `actor_type ENUM('USER','DEVELOPER','ANONYMOUS')` · `actor_id VARCHAR(64) NULL` · `action VARCHAR(40)` · `target_type ENUM('USER','DOCUMENT','FRIENDSHIP') NULL` · `target_id CHAR(36) NULL` · `outcome ENUM('SUCCESS','FAILURE')` · `error_code VARCHAR(40) NULL` · `request_id CHAR(36) NULL` · `metadata JSON NULL`. Index: `(created_at)`, `(actor_id, created_at)`, `(target_id, created_at)`, `(request_id)`.

Áp lên DB có dữ liệu: sao lưu `mysqldump` + thư mục SeaweedFS → `npm --prefix backend run prisma:deploy` → đếm số dòng trước/sau. Không reset DB.

### A12.5 API admin

Qua `/__local/backend/admin/*` → `127.0.0.1:3003/admin/*`, chỉ developer. Envelope như §A7.2.

| ID | Method · Path | Input | Output (`data`) | Mã |
|---|---|---|---|---|
| ADM-01 | `GET /admin/overview` | — | `OverviewDto` | 200 |
| ADM-02 | `GET /admin/users` | `q`, `page`, `pageSize` (20) | `Page<AdminUserDto>` | 200; 400 |
| ADM-03 | `GET /admin/users/{id}` | — | `AdminUserDetailDto` | 200; 404 `USER_NOT_FOUND` |
| ADM-05 | `PATCH /admin/users/{id}` | `{ email?, displayName? }` | `AdminUserDetailDto` | 200; 400; 404; 409 `EMAIL_ALREADY_EXISTS`, `ACCOUNT_DELETING` |
| ADM-06 | `POST /admin/users/{id}/sessions/revoke` | — | `{ revoked }` | 200; 404 |
| ADM-07 | `POST /admin/users/{id}/deletion` | `{ confirmEmail }` | `{ status, deletedDocuments }` | 200; 400 `CONFIRMATION_MISMATCH`; 404; 503 `ACCOUNT_DELETION_INCOMPLETE` + `remainingDocuments` |
| ADM-08 | `GET /admin/activity` | `actorId?`, `action?`, `targetId?`, `outcome?`, `from?`, `to?`, `page`, `pageSize` (50, tối đa 100) | `Page<AuditEventDto>` | 200; 400; 503 |
| ADM-09 | `GET /admin/errors` | `window` (`15m`/`1h`/`24h`), `module?`, `code?`, `minStatus?` (500), `page` | `{ summary, items }` | 200; 400 |
| ADM-10 | `GET /admin/requests/{requestId}` | — | `{ errors, audit, auditUnavailable }` | 200; 400 |
| ADM-11 | `GET /admin/online` | — | User có request trong 5 phút gần nhất | 200 |
| ADM-12 | `GET /admin/timeline` | `userId?`, `errorsOnly?`, `page` | `{ coverageFrom, items: Page<TimelineItemDto> }`: request gần nhất kèm email/tên tài liệu | 200; 400 |

| DTO | Trường |
|---|---|
| `OverviewDto` | `users { registered, active15m, active24h, active7d, deleting }` · `documents { total, public, private }` · `storage { logicalBytes, diskBytes }` · `health { database, storage, backend }` · `metrics` (hoặc `null`) · `generatedAt` |
| `AdminUserDto` | `id, email, displayName, status, createdAt, lastActiveAt, documentCount, storageBytes` (trường E4/E5 luôn `null`) |
| `AdminUserDetailDto` | `AdminUserDto` + `publicDocuments, privateDocuments, activeSessions, deletionStartedAt, recentActivity` |
| `AuditEventDto` | `id, at, actorType, actorId, action, targetType, targetId, outcome, errorCode, requestId, metadata` |
| `ErrorEventDto` | `at, level, service, module, stage, event, code, status, method, path (bỏ query), durationMs, requestId, userId, message, stack` |

Xoá tài khoản (XA-04):

```mermaid
sequenceDiagram
  participant A as Admin UI
  participant S as XA-04
  participant D as MySQL
  participant O as SeaweedFS
  A->>S: ADM-07 confirmEmail
  S->>D: Kiểm email, SET deletion_started_at, DELETE sessions
  loop Từng tài liệu của user
    S->>O: deleteObject(storage_key)
    alt Storage lỗi
      S->>D: INSERT audit ADMIN_ACCOUNT_DELETE FAILURE
      S-->>A: 503 chưa hoàn tất, còn N
    else OK hoặc object không tồn tại
      S->>D: DELETE documents WHERE id = ? AND storage_key = ?
    end
  end
  S->>D: DELETE audit_events WHERE actor_type = 'USER' AND actor_id = ?
  S->>D: DELETE users (sessions tự xoá theo FK)
  alt Còn tài liệu mới chen vào (FK chặn)
    S-->>A: 503 chưa hoàn tất
  else
    S->>D: INSERT audit ADMIN_ACCOUNT_DELETE SUCCESS + maskedEmail
    S-->>A: 200 COMPLETED
  end
  Note over A,S: Bấm lại = chạy lại từ đầu, bước đã xong được bỏ qua tự nhiên
```

### A12.6 Giám sát hiệu năng, thử tải, cache

**Cách đo (XM-05):** request/giây, 4xx, 5xx theo 30 ô × 10 giây (5 phút); số request đang xử lý; P50/P95 từ mảng vòng 1 000 thời gian phản hồi; CPU/RAM của process và máy mỗi 5 s; event loop P99. Chỉ đo tổng, không theo route; mất khi khởi động lại. Trên AWS dùng CloudWatch.

**Thử tải (XM-12):** backend production-like trỏ `btl_cloud_load` + bucket riêng, `LOG_LEVEL=warn`. Ba kịch bản tăng dần 1 → 10 → 50 kết nối: tìm kiếm (thường nghẽn MySQL), tải xuống 1 MiB (SeaweedFS/đĩa), đăng nhập (CPU argon2id). Đọc cùng dashboard: CPU ~100% + event loop trễ → nghẽn CPU; CPU thấp nhưng P95 tăng → nghẽn DB/storage; 429 là do rate limit. Lệnh và kết quả mẫu: [scripts/load/README.md](../scripts/load/README.md). Số đo local không suy ra cho AWS.

**Cache hiện có:** chỉ cache tài nguyên tĩnh production (`/assets/*` immutable 1 năm; `index.html` `no-cache`). JSON `/api` là `no-store`; API-13 là `private, no-store`. Không có Redis hay cache phía server. Chỉ đề xuất cache (bằng CR) khi số đo cho thấy **cả ba**: một endpoint đọc chậm hơn mục tiêu; đã thử sửa truy vấn/index mà không đủ; dữ liệu đọc nhiều, ít đổi. Không bao giờ cache dữ liệu phụ thuộc quyền.

### A12.7 Audit log và chẩn đoán lỗi (E7)

| | E3 Hiệu năng | E7 Audit | E7 Lỗi chẩn đoán |
|---|---|---|---|
| Câu hỏi | Hệ thống chịu tải ra sao? | Ai đã làm gì? | Lỗi ở module, bước, request nào? |
| Lưu ở | Bộ nhớ (5 phút) | MySQL `audit_events` | stdout → file log controller (local) / CloudWatch Logs (AWS) |
| Đọc ở | ADM-01 | ADM-03, ADM-08 | ADM-09, ADM-10 |

**Danh mục sự kiện.** `metadata` chỉ nhận đúng các khoá ghi ở đây.

| `action` | `target_type` | `metadata` cho phép |
|---|---|---|
| `AUTH_REGISTER`, `AUTH_LOGIN`, `AUTH_LOGOUT` | `USER` (`null` khi thất bại) | — |
| `DOCUMENT_UPLOAD` | `DOCUMENT` | `visibility`, `fileType`, `sizeBytes` |
| `DOCUMENT_DOWNLOAD`, `DOCUMENT_DELETE` | `DOCUMENT` | — |
| `DOCUMENT_UPDATE` | `DOCUMENT` | `fields` (tên trường), `visibility` |
| `DOCUMENT_REPLACE` | `DOCUMENT` | `fileType`, `sizeBytes`, `fileVersion` |
| `ADMIN_USER_UPDATE` | `USER` | `fields` |
| `ADMIN_SESSIONS_REVOKE` | `USER` | `revoked` |
| `ADMIN_ACCOUNT_DELETE` | `USER` | `maskedEmail`, `deletedDocuments`, `remainingDocuments` |

**Quy tắc ghi:**
- `SUCCESS` khi 2xx. `FAILURE` khi ≥ 400 **và** biết actor, hoặc khi là `AUTH_LOGIN`/`AUTH_REGISTER` (actor `ANONYMOUS`, không email). Request bị chặn trước route (CSRF, 404 route) không tạo sự kiện. Tải xuống bị client ngắt → `FAILURE` `CLIENT_ABORTED`.
- **Không** ghi: xem trang, tìm kiếm, xem chi tiết, `GET /api/auth/me`, health, body request, tiêu đề/tên tệp, email (trừ email đã che khi xoá tài khoản), mật khẩu, cookie, token, IP, user-agent.
- Ghi audit lỗi không đổi kết quả nghiệp vụ, nhưng phải có log ERROR `audit.write_failed` kèm `requestId`.
- Retention `AUDIT_RETENTION_DAYS` (mặc định 90, 1–3650): khi khởi động `DELETE … WHERE created_at < NOW(3) - INTERVAL ? DAY LIMIT 10000`, lặp tới hết.
- Xoá tài khoản: xoá sự kiện có actor là user; giữ sự kiện admin kèm email đã che (`n***@gmail.com`).

**Trường chẩn đoán (XM-14).** `module` theo tiền tố đường dẫn (`lib/module-of.ts`): `/api/auth` → `auth`, `/api/documents` → `documents`, `/api/health` → `health`, `/api/me` và `/api/users` → `users`, `/api/friends` → `friends` (để sẵn cho E4–E5), còn lại → `http`. `stage` ∈ `validate`, `authorize`, `inspect`, `storage.put`, `storage.get`, `storage.delete`, `db`, `null`. Dòng không gắn request dùng `event = "<module>.<stage>"` (`storage.orphan`, `audit.write_failed`…).

**Đọc lỗi (XA-07).** Controller ghi mỗi dòng stdout vào `backend/tmp/local-services.ndjson` (đã lọc bí mật, xoay file ở 2 MB, giữ `.1`). XA-07 đọc hai file, lấy dòng `level ≥ 40` của `backend`/`admin`, lọc theo cửa sổ, nhóm theo `module`, `code`; `coverageFrom` cho biết log cũ nhất còn đọc được. Trên AWS (nếu có CloudWatch Logs): `fields @timestamp, module, stage, code, res.statusCode, durationMs | filter requestId = "<id>"`.

### A12.8 Tương thích AWS và rủi ro

- Admin không có trong repo và bản build, không chạy được với DB/S3 không phải loopback → trên AWS không có quản lý user, Activity, Errors (chấp nhận). M5 không đổi.
- Metrics chạy trong backend nhưng không có endpoint; AWS dùng CloudWatch. `audit_events` ghi chung trên RDS; mỗi instance xoá quá hạn khi khởi động (chạy trùng vẫn an toàn).

| ID | Rủi ro | Giảm thiểu |
|---|---|---|
| XR-01 | Mã admin không có trong Git: mất máy là mất mã, không có CI | Owner sao lưu thư mục admin ra ngoài máy (E1-07) |
| XR-02 | File commit lỡ import mã admin → clone sạch hỏng | Chỉ `spawn`/`import.meta.glob`; `admin-isolation.mjs` |
| XR-03 | Tunnel public trỏ nhầm `:3003`/`:5173` | Admin vẫn đòi token và loopback; WINDOWS_HOSTING chỉ publish `:3000` |
| XR-08 | Dữ liệu cá nhân lọt vào `metadata` audit | Allowlist theo `action` |
| XR-10 | Log local quá ngắn, lỗi cũ bị xoay mất | `coverageFrom` hiện trên UI; sự kiện quan trọng vẫn ở `audit_events` |
