# Kiến trúc và hợp đồng kỹ thuật

Tài liệu mô tả mã nguồn hiện tại. Phạm vi sản phẩm nằm trong [PROJECT_OVERVIEW](PROJECT_OVERVIEW.md); cách chạy dành cho người dùng nằm trong [README](../README.md).

## A1. Tổ chức hệ thống

### A1.1 Technology stack

React 19, React Router, TypeScript và Vite ở frontend; Node.js 24, Express 5, Prisma 6 và MySQL 8.4 ở backend. Tệp lưu trong object storage qua adapter S3: SeaweedFS local hoặc S3 trên AWS. Phiên đăng nhập nằm trong MySQL nên dùng được khi có nhiều instance.

### A1.2 Quyết định thiết kế

- DB lưu metadata, quyền, phiên và dữ liệu suy ra cần bền vững; object storage giữ byte của tệp.
- SPA và `/api` cùng origin ở website public. Vite chỉ phục vụ phát triển/quản trị local.
- Không trả URL S3 trực tiếp: backend kiểm quyền rồi stream download.
- Cấu hình được validate khi khởi động; không đưa `.env`, secret, dữ liệu local hoặc admin vào artifact public.
- Các package có lockfile riêng. Root chỉ điều phối cài đặt, lint, build và test.

### A1.3 Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `backend/src/` | API, nghiệp vụ, repository, storage và thuật toán |
| `backend/prisma/` | Schema và migration đã commit |
| `backend/dev/` | Controller, launcher, dịch vụ local và tunnel; không vào build backend |
| `backend/scripts/` | Khởi tạo bucket và backfill fingerprint |
| `frontend/src/` | Giao diện, API client, hook và kiểm thử component |
| `scripts/` | Điều phối, kiểm tra artifact, thử tải và đánh giá |
| `docker-compose.yml`, `docker/` | MySQL/SeaweedFS tuỳ chọn và cấu hình bootstrap dùng chung với portable |
| `docs/` | Bốn tài liệu dự án; README dành cho người sử dụng |

`backend/admin/`, `frontend/src/admin/`, `frontend/admin-tests/` chỉ có trên máy owner và được Git bỏ qua. Mọi file `.bat` là tiện ích local, cũng được Git bỏ qua.

### A1.4 Quy tắc phụ thuộc

Route/controller gọi service; chỉ repository truy cập Prisma; chỉ adapter S3 dùng AWS SDK. Service không phụ thuộc Express. Frontend gọi mạng qua `api/`. So trùng và gợi ý độc lập lúc chạy, cùng dùng chuẩn hoá chữ và predicate quyền truy cập.

## A2. Luồng chính

| Luồng | Xử lý |
|---|---|
| Đăng nhập | Validate → kiểm mật khẩu → tạo token ngẫu nhiên, lưu hash phiên → cookie HttpOnly |
| Tìm kiếm | Validate query → SQL theo phạm vi Public/owner → xếp hạng nếu cần → DTO |
| Upload | Ghi tmp → kiểm tệp → so trùng → PutObject → transaction metadata/fingerprint → dọn tmp |
| Thay tệp | Kiểm quyền → kiểm tệp mới → so trùng, loại chính tài liệu → object mới → transaction cập nhật phiên bản/fingerprint → xoá object cũ |
| Download | Nạp phiên → kiểm quyền → GetObject → stream attachment |
| Xoá | Kiểm quyền → xoá object → xoá metadata; fingerprint/tương tác mất theo FK |

## A3. Ứng dụng

`app.ts` lắp middleware và router; `container.ts` lắp service/repository; `server.ts` khởi tạo hạ tầng, dọn dữ liệu quá hạn và listen. Pipeline API: request id, log/metrics, header bảo mật, JSON/cookie, no-store, CSRF, phiên, router và error handler.

`/api/health` là liveness, không phụ thuộc DB/storage. `/api/health/ready` kiểm DB và storage, trả 503 nếu chưa sẵn sàng. Graceful shutdown dừng nhận request, đóng DB/storage và có deadline 30 giây. Timeout request 900 giây hỗ trợ upload/download chậm; keep-alive 125 giây.

## A4. Cơ sở dữ liệu

Schema đầy đủ: [schema.prisma](../backend/prisma/schema.prisma). MySQL dùng `utf8mb4_0900_ai_ci`, id UUID, thời gian UTC `DateTime(3)`.

### A4.3 Đặc tả bảng

| Bảng | Dữ liệu và ràng buộc chính |
|---|---|
| `users` | Email duy nhất, password hash, tên, trạng thái xoá, `personalization_enabled=false` |
| `sessions` | Hash token, chủ phiên, thời hạn; CASCADE khi xoá user |
| `documents` | Chủ, metadata, visibility, loại/kích thước tệp, storage key duy nhất, `file_version` |
| `audit_events` | Sự kiện nghiệp vụ; không FK để giữ dấu vết khi đối tượng bị xoá |
| `document_fingerprints` | Một dòng/tài liệu: SHA-256, phiên bản tệp/thuật toán, trạng thái chữ, hash chữ và MinHash 512 byte |
| `document_ingestion_locks` | Một dòng `id=1`; khoá transaction cho kiểm trùng/commit giữa các tài khoản và instance |
| `document_interactions` | Khoá `(user_id, document_id, kind)`; `VIEW`/`DOWNLOAD`, thời điểm đầu/cuối |

Fingerprint và tương tác CASCADE theo tài liệu; tương tác CASCADE theo user. User có tài liệu dùng FK RESTRICT để xoá tệp có kiểm soát. Chỉ fingerprint có `file_version` khớp tài liệu mới được dùng.

### A4.4 Truy vấn, vòng đời, migration

`discoverableSql()` là điều kiện chung: Public và chủ chưa DELETING. `duplicateScopeSql(ownerId)` thêm tài liệu của chính người upload ở mọi visibility. `findDiscoverableByIds()` kiểm lại quyền và giữ thứ tự đầu vào.

Migration `20261115172311_document_intelligence` chỉ thêm hai bảng cùng cột cá nhân hoá; không đổi mặc định của nghiệp vụ cũ. Áp dụng bằng `prisma migrate deploy`. DB có dữ liệu phải sao lưu; không dùng reset/db push để xử lý lỗi migration. Bản cũ thiếu fingerprint vẫn hoạt động; backfill là tác vụ riêng.

## A5. Xác thực và phân quyền

### A5.1 Mô hình và mật khẩu

Mật khẩu dùng Argon2id. Đăng ký chuẩn hoá email, validate tên/mật khẩu; đăng nhập không tiết lộ tài khoản nào tồn tại.

### A5.2 Vòng đời phiên

Token ngẫu nhiên chỉ lưu trong cookie; DB lưu SHA-256 token. Đăng nhập cấp phiên mới; đăng xuất thu hồi và xoá cookie. Phiên mặc định 168 giờ; phiên hết hạn được dọn lúc khởi động.

### A5.3 Cookie

HttpOnly, SameSite=Lax, Path=/, không Domain. Bật `COOKIE_SECURE=true` khi dùng HTTPS. Gateway Quick Tunnel luôn thêm Secure vào cookie trả qua public.

### A5.4 Chống CSRF

POST/PUT/PATCH/DELETE bắt buộc `X-CSRF-Protection: 1`; nếu có Origin thì phải thuộc `ALLOWED_ORIGINS`. Không bật CORS. Gateway kiểm đúng Origin của tunnel hiện tại trước khi chuyển về Origin local được API cho phép.

### A5.5 Phân quyền phía server

`canView`/`canManage` và loader là nơi quyết định quyền. Private chỉ chủ được xem; sửa/thay/xoá chỉ chủ. Trường hợp không được thấy tài liệu trả 404. Gợi ý và so trùng không được làm lộ dữ liệu Private của người khác, kể cả khi chỉ mục cũ.

### A5.6 Giới hạn tần suất

Auth mặc định 20 request/15 phút/IP; đăng nhập chỉ đếm thất bại. Suggestions 60 request/phút/IP. Giới hạn nằm trong RAM từng instance, trả 429 và `Retry-After`.

### A5.8 Cross-origin, HTTPS, header, log

Helmet đặt CSP, no-sniff và các header bảo mật; HSTS chỉ bật khi HTTPS. Logger che cookie, mật khẩu, token và giá trị query `q`. Không log nội dung trích từ tệp. Chỉ tin forwarded header từ proxy được cấu hình, không bật `TRUST_PROXY=true` tuỳ tiện.

## A6. Object storage và vòng đời tài liệu

### A6.1 Nguyên tắc

Bucket private; object key sinh bởi server, không lấy từ tên tệp. Upload/download theo stream; tmp nằm trong `UPLOAD_TMP_DIR` và được dọn khi request hoàn tất hoặc khởi động lại.

### A6.4 FileInspector

Chỉ nhận PDF/DOCX/PPTX, không rỗng, tối đa 50 MiB, một tệp/request. Kiểm đuôi và magic bytes; DOCX/PPTX phải có main part hợp lệ trong ZIP. Không tin MIME phía client. Tên tệp loại đường dẫn/ký tự điều khiển, giới hạn 255 code point. Bước kiểm định dạng không đồng nghĩa nội dung đọc được hoặc đã quét virus.

### A6.9 Ma trận lỗi

PutObject lỗi không tạo metadata. DB lỗi sau khi upload thì bù trừ object mới. Thay tệp thất bại giữ bản cũ; object cũ chỉ được xoá sau commit. Xoá object thất bại giữ dòng để thử lại. Lỗi bù trừ được log theo request id; không có worker tự quét/xoá object mồ côi. Các nhánh cụ thể được kiểm ở `backend/test/integration/documents-*.test.ts`.

## A7. REST API Contract

### A7.1 Quy ước chung

JSON camelCase, thời gian ISO-8601 UTC, độ dài chuỗi tính bằng Unicode code point. GET không đổi dữ liệu nghiệp vụ; lỗi gợi ý/ghi tương tác được cô lập. Upload dùng multipart với part `file`.

### A7.2 Envelope

Thành công `{ data: ... }`; 204 không có body. Lỗi `{ error: { code, message, details, requestId } }`; lỗi so trùng có thêm `duplicates`. Không trả stack trace hay storage key.

### A7.3 Mã lỗi

400 validate/JSON, 401 chưa đăng nhập/sai thông tin, 403 CSRF/quyền, 404 không tìm thấy, 409 email đã tồn tại/tệp trùng bị chặn, 413 quá kích thước, 415 sai loại tệp, 429 giới hạn tần suất, 500 lỗi nội bộ, 503 DB/storage chưa sẵn sàng. Danh sách chính xác: [errors.ts](../backend/src/http/errors.ts).

### A7.4 Schema dùng chung

`DocumentDto`: id, title, description, visibility, fileType, originalFilename, sizeBytes, fileVersion, owner `{ id, displayName }`, isOwner, createdAt, updatedAt, fileUpdatedAt. Không có email của chủ tài liệu. `Page<T>` gồm items, page, pageSize, totalItems, totalPages. Xem [document.mapper.ts](../backend/src/modules/documents/document.mapper.ts).

Upload/thay tệp bổ sung `duplicateCheck`: mode, result ACCEPT/WARNING, exactMatches, textMatches, textAnalysis `{ status, reason, candidatesScanned, candidatesTruncated }`. Match gồm documentId, title, visibility, ownedByYou, matchType EXACT/SAME_TEXT/SIMILAR_TEXT, similarity.

### A7.5 Quy tắc validate

Email tối đa 254; tên hiển thị 1–100; đăng ký mật khẩu 8–128; tiêu đề 1–200; mô tả tối đa 2.000; query tối đa 100 code point. Body auth/metadata/settings từ chối trường lạ. PATCH cần ít nhất một thay đổi; thay tệp chỉ nhận part file. Schema là nguồn chuẩn tại `http/validate.ts`, `auth.schemas.ts`, `documents.schemas.ts`.

### A7.6 Tìm kiếm, sắp xếp, phân trang

`q`, `fileType`, `sort`, `page` 1–10.000, `pageSize` 1–50 (mặc định 12). Public nhận newest/title/relevance; mine nhận newest/title và visibility. SQL LIKE có escape `%`, `_`, `!`. API mặc định newest; giao diện có từ khoá mặc định relevance.

### A7.7 Endpoint

| Method/path | Quyền | Kết quả |
|---|---|---|
| GET `/api/health`, `/api/health/ready` | Public | Liveness/readiness |
| GET `/api/auth/me` | Public | `{ user }`, null khi Guest |
| POST `/api/auth/register`, `/api/auth/login` | Public + CSRF | User + session cookie |
| POST `/api/auth/logout` | CSRF | 204 |
| GET `/api/documents` | Public | Page tài liệu Công khai |
| GET `/api/documents/mine` | User | Page tài liệu của mình |
| GET `/api/documents/:id` | Được xem | DocumentDto |
| POST `/api/documents` | User + CSRF | 201, DocumentDto + duplicateCheck |
| PATCH `/api/documents/:id` | Owner + CSRF | DocumentDto |
| PUT `/api/documents/:id/file` | Owner + CSRF | DocumentDto + duplicateCheck |
| GET `/api/documents/:id/download` | User + được xem | Stream attachment |
| DELETE `/api/documents/:id` | Owner + CSRF | 204 |
| GET `/api/recommendations/home` | Public | `{ strategy, items: [{ document, reason }] }`, limit 1–20, mặc định 8 |
| GET `/api/documents/:id/related` | Được xem | `{ items: DocumentDto[] }`, limit 1–12, mặc định 6 |
| GET `/api/recommendations/suggestions` | Public | `{ items: [{ documentId, title }] }`, tối đa 8 |
| GET `/api/recommendations/settings` | User | `{ personalizationEnabled, historyItems }` |
| PUT `/api/recommendations/settings` | User + CSRF | Cập nhật `{ personalizationEnabled: boolean }` |
| DELETE `/api/recommendations/history` | User + CSRF | 204 |

## A8. Frontend UX/UI

Trang chủ/khám phá, đăng ký/đăng nhập, kho cá nhân, upload, chi tiết, chỉnh sửa và 404. API client và hook xử lý loading, lỗi, huỷ request và phiên hết hạn. Cache của tài liệu/tài khoản khác không được hiển thị khi chuyển trang. Xoá và thay tệp có xác nhận; lỗi upload/thay tệp giữ dữ liệu để sửa và gửi lại.

Autocomplete dùng combobox ARIA, debounce 250 ms, AbortController và phím lên/xuống/Enter/Esc. Các mục gợi ý bị ẩn khi rỗng hoặc lỗi; không chặn trang chính. Bản production không có route/link/code admin.

## A9. So trùng và gợi ý

### A9.1 Chuẩn hoá chung

`normalizeText`: NFKC → chữ thường → phân tách ký tự không phải chữ/dấu/số. `tokenize` giữ dấu tiếng Việt; `foldForMatch` bỏ dấu và đổi đ→d chỉ để khớp tìm kiếm. Thay đổi chuẩn hoá ảnh hưởng fingerprint phải tăng phiên bản thuật toán.

### A9.2 Phát hiện trùng

SHA-256 tính theo stream cho mọi tệp. `warn`/`off` trong cấu hình cũ được nâng thành `block` cho web API; từ chối bản trùng bytes hoặc giống chữ từ 90% theo phạm vi ở [PROJECT_OVERVIEW](PROJECT_OVERVIEW.md). Từ 70% đến dưới 90% cho upload/thay tệp và trả WARNING. Thay tệp loại chính documentId. Transaction khoá dòng ingest dùng chung, user và khi thay tệp khoá document để kiểm tra lại cả SHA-256 và chữ trước commit; áp dụng giữa các tài khoản và instance. Trích chữ và PutObject không giữ khoá ingest.

Trích chữ trong worker mới cho mỗi job; truyền đường dẫn tmp, không chuyển cả tệp qua message. PDF dùng `pdfjs-dist` 6.5.438 ở chế độ parser, tắt eval/render/canvas; DOCX đọc `word/document.xml`, PPTX đọc slide theo thứ tự số. Không lưu chữ thô vào DB.

| Giới hạn | Giá trị |
|---|---|
| Worker | 1 job chạy, tối đa 3 job chờ; deadline gồm thời gian chờ 15 giây |
| Heap worker | Old 192 MiB, young 32 MiB |
| PDF phân tích | Tệp tối đa 10 MiB; 100 trang đầu |
| OOXML | 300 phần; 10 MiB XML/phần, tổng 32 MiB giải nén thực |
| Văn bản | Tối thiểu 50 từ; tối đa 20.000 từ |
| So sánh | Tối đa 2.000 ứng viên có quyền xem, báo khi bị cắt |

MinHash v1 dùng tập shingle 5 từ, 128 hàm băm `(a*x+b) mod (2^31-1)` với seed SHA-256 cố định; lưu 128 uint32 big-endian = 512 byte. So tương đồng là tỷ lệ ô bằng nhau; ngưỡng cảnh báo 0,7 và ngưỡng từ chối upload 0,9 (dùng giá trị chưa làm tròn). `text_sha256` chỉ có khi phân tích đầy đủ, dùng cho SAME_TEXT. Match chỉ giữ tối đa 5 mỗi nhóm.

Trạng thái chữ: OK (đầy đủ), PARTIAL (giới hạn từ/trang/phần), SKIPPED (tắt, quá lớn, mã hoá, hỏng, thiếu chữ, timeout, bận, không hỗ trợ hoặc lỗi). SKIPPED không có nghĩa 0% hay không trùng. PDF không có chữ/không hỗ trợ trích chữ vẫn được so SHA-256; lỗi worker tạm thời (BUSY/TIMEOUT/ERROR), lỗi DB so sánh hoặc tập ứng viên bị cắt khiến web API trả 503 để thử lại, không cho upload vượt kiểm tra. Policy chuẩn: [duplicate.policy.ts](../backend/src/modules/duplicates/duplicate.policy.ts).

### A9.3 Gợi ý kết hợp

Chỉ dùng title lặp hai lần và description, không đọc fingerprint/chữ trích từ tệp. TF-IDF unigram: `(1+ln tf) * (ln((1+N)/(1+df))+1)`, chuẩn hoá L2, cosine. Chỉ mục chứa tối đa 5.000 tài liệu Công khai mới nhất; dựng theo lô 250, nhường event loop, dùng chung promise đang dựng, làm mới mỗi 10 phút. Lỗi giữ bản cũ hoặc fallback; luôn hydrate/kiểm quyền lại từ SQL.

| Bề mặt | Thứ tự/điểm |
|---|---|
| Home có lịch sử | 0,5 sở thích + 0,3 phổ biến + 0,2 độ mới; loại tài liệu của mình/đã tương tác |
| Home cold start | 0,6 phổ biến + 0,4 độ mới; không có popularity thì newest |
| Liên quan | 0,8 cosine + 0,1 phổ biến + 0,1 độ mới; cosine ≥ 0,10; loại nguồn |
| Tìm relevance | Mức khớp 0–5 trước, sau đó 0,5 sở thích + 0,25 phổ biến + 0,25 độ mới |
| Suggestions | Bắt đầu tiêu đề → đầu từ → chứa; rồi phổ biến/mới; không cá nhân hoá |

Mức khớp tìm kiếm: tiêu đề bằng query (5), nguyên cụm từ (4), đầu từ (3), chứa (2), chỉ mô tả chứa (1), còn lại (0). Chỉ top-200 được xếp lại; phần đuôi giữ SQL khớp tiêu đề trước rồi `created_at DESC, id DESC`. Không trùng/thiếu tại ranh giới trang. Khi tắt gợi ý hoặc ở phần đuôi, chỉ truy vấn trang cần lấy, không tải 200 ứng viên và lịch sử không dùng.

Tương tác chỉ ghi sau response thành công, cho user opt-in xem/tải tài liệu Công khai của người khác. Một dòng/loại/user/tài liệu; lượt lặp cập nhật lastAt. VIEW nặng 1, DOWNLOAD nặng 2, giảm một nửa sau 30 ngày. Hồ sơ dùng 50 tương tác gần nhất, giữ 100 term; popularity dùng 30 ngày và chỉ hiện qua thứ tự. Lịch sử giữ 90 ngày, dọn khi khởi động và mỗi 24 giờ. Tắt cá nhân hoá xoá lịch sử trong cùng transaction. Query tìm kiếm không được lưu.

Home lỗi ranking dùng newest; related/suggestions lỗi trả rỗng; search lỗi ranking dùng SQL thô. DB hỏng vẫn trả lỗi hạ tầng chuẩn. Policy chuẩn: [ranking.policy.ts](../backend/src/modules/recommendations/ranking.policy.ts).

## A10. Local và AWS

### A10.1 Local: cổng, URL, Docker Compose

| Cổng | Vai trò | Bind local |
|---|---|---|
| 3000 | Backend API | 127.0.0.1 qua launcher |
| 3001 | Controller | 127.0.0.1 |
| 3002 | Gateway Quick Tunnel | 127.0.0.1 |
| 3003 | Admin API | 127.0.0.1 |
| 5173 | Vite/quản trị | localhost |
| 3306/9000 | MySQL/S3-compatible | loopback |

Windows mặc định portable, không tự dò/chuyển sang Docker. Muốn controller quản lý Docker, đặt `BTL_LOCAL_MODE=docker` trước khi bật; chỉ dừng container do launcher tạo, giữ volumes. Linux/macOS dùng Compose rồi tự chạy app bằng Node. Hướng dẫn thao tác ở [WINDOWS_HOSTING](WINDOWS_HOSTING.md).

### A10.2 Biến môi trường backend

Mẫu đầy đủ: [backend/.env.example](../backend/.env.example). Giá trị mặc định nằm tại [env.ts](../backend/src/config/env.ts).

| Nhóm | Biến |
|---|---|
| Runtime/DB | NODE_ENV, HOST, PORT, DATABASE_URL, LOG_LEVEL, INSTANCE_ID |
| Storage | S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_FORCE_PATH_STYLE; AWS dùng IAM Role |
| Phiên/bảo mật | ALLOWED_ORIGINS, SESSION_COOKIE_NAME, COOKIE_SECURE, SESSION_TTL_HOURS, TRUST_PROXY, HSTS_ENABLED, AUTH_RATE_LIMIT_MAX |
| Tệp/SPA | UPLOAD_TMP_DIR, SERVE_FRONTEND, FRONTEND_DIST_DIR |
| Audit, so trùng, gợi ý | AUDIT_RETENTION_DAYS=90, DUPLICATE_MODE=block, RECOMMENDATIONS_ENABLED=true |

Env chỉ đọc lúc khởi động. Launcher local từ chối production hoặc DB/storage không phải loopback. `BTL_LOCAL_PRODUCTION=1` cho phép riêng backend con chạy bản build production; controller/Vite vẫn development.

### A10.6 Môi trường test

Unit test không cần dịch vụ ngoài. Integration test dùng DB tên kết thúc `_test`, bucket riêng, chạy tuần tự. Setup áp migration bằng deploy; fixture xoá dữ liệu test giữa các ca. Không trỏ TEST_DATABASE_URL/TEST_S3_BUCKET vào dữ liệu thật. Các lệnh và ma trận kiểm thử ở [MILESTONES](MILESTONES.md).

### A10.7 AWS theo bàn giao 15/11/2026

Thông tin được tiếp nhận từ bàn giao, không phải kết quả truy vấn tài khoản AWS hiện tại:

| Thành phần | Cấu hình bàn giao |
|---|---|
| Mạng | ap-southeast-2, VPC 2 AZ, EC2 private, không NAT, S3 Gateway Endpoint |
| ALB/TG | prj-app-alb HTTP:80 → prj-app-tg HTTP:3000; health `/api/health` |
| ASG/LT | prj-app-asg, t3.micro, min 1/max 6, prj-app-lt v3; CPU 35%, RequestCountPerTarget 15.000, grace 300 giây |
| Runtime | AL2023, Node 24, `/opt/prj-app`, systemd `prj-app` |
| Dữ liệu | RDS MySQL Single-AZ, schema webdb, TLS strict; S3 bucket s3bucketwebchiase |
| Bootstrap | Tải app.tar.gz, bootstrap/app.env, bootstrap/rds-ca-bundle.pem từ S3 khi tạo instance |

ALB trong cấu hình bàn giao dùng HTTP; cookie Secure và HSTS không bật trên đường truy cập này. Instance lấy artifact cùng dependency từ S3 vì không có Internet. Bucket bàn giao chứa tài liệu, artifact và cấu hình bootstrap.

## A11. Giới hạn đã biết

Không quét virus/OCR; PDF font cũ có thể trích chữ sai. So trùng chỉ xét tập ứng viên hữu hạn, không bảo đảm phát hiện mọi bản gần giống; Tìm kiếm relevance chỉ xếp lại top-200. Chỉ mục mới nhất trễ tối đa một chu kỳ refresh. Rate limit và chỉ mục nằm riêng từng instance; RDS Single-AZ là một điểm lỗi. Benchmark local không thay thế số đo t3.micro.

## A12. Quản trị local

### A12.2 Ranh giới admin local và public

Trình duyệt localhost:5173 → Vite `/__local/backend` → controller:3001 → admin:3003. Controller kiểm Host, Origin, địa chỉ loopback, capability token và phiên developer trước khi proxy; admin kiểm token riêng. Tài khoản developer dùng hash scrypt trên đĩa, cookie HttpOnly SameSite=Strict, tối đa 8 giờ, khác tài khoản website.

Gateway public chỉ phục vụ frontend build và proxy `/api` về backend:3000; chặn `/admin`, `/__local`, `/api/dev`. Điều khiển worker tunnel cần bearer token trên đĩa và Host loopback chính xác. Worker chỉ giữ handle cloudflared do nó tạo, tự thoát khi controller đổi/thoát. Hai chế độ admin/server dùng chung stack. `stop server.bat` dừng cả hai chế độ và toàn bộ stack; `stop admin.bat` giữ stack và tunnel nếu server đang chạy, còn khi chỉ có admin thì dừng toàn bộ.

### A12.4 CSDL và xoá tài khoản

`last_active_at` cập nhật tối đa mỗi 5 phút mà không đổi updatedAt. Xoá tài khoản đánh dấu DELETING, thu hồi phiên, xoá object/tài liệu rồi user; lỗi dở có thể tiếp tục. Audit không FK, admin xử lý audit liên quan theo quy trình xoá. Fingerprint/tương tác không cần logic admin riêng nhờ CASCADE.

### A12.6 Giám sát hiệu năng, thử tải, cache

Metrics trong Express theo request/CPU/RAM/event loop; wrapper local ghi snapshot mỗi 5 giây. Controller giữ PID/handle và log NDJSON xoay 2 MiB, có một bản cũ. Admin đọc log/snapshot; production không mở endpoint metrics/admin. Chỉ mục gợi ý là dữ liệu công khai suy ra; quyết định quyền luôn truy vấn DB. Cách thử tải: [scripts/load/README](../scripts/load/README.md).

### A12.7 Audit và chẩn đoán

Audit ghi sự kiện auth, thao tác tài liệu và admin; chỉ metadata nằm trong allowlist, không chứa mật khẩu/token/chữ tệp. Giữ mặc định 90 ngày. Log request có requestId, userId, module, stage, code, durationMs; lỗi audit chỉ được log, không đổi response nghiệp vụ.
