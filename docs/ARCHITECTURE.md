# Kiến trúc và API

React 19/Vite/TypeScript ở frontend; Node.js 24, Express 5, Prisma 6 và MySQL 8.4 ở backend. MySQL giữ metadata và phiên; SeaweedFS hoặc S3 giữ tệp. Website public phục vụ SPA và `/api` cùng origin.

## Tổ chức mã

| Đường dẫn | Vai trò |
|---|---|
| `backend/src/` | API, nghiệp vụ, repository, storage và thuật toán |
| `backend/prisma/` | Schema và migration |
| `backend/dev/` | Launcher, controller, portable services và tunnel local |
| `backend/scripts/` | Khởi tạo bucket và bảo trì dữ liệu |
| `frontend/src/` | Giao diện, API client, hook và component test |
| `scripts/` | Điều phối, kiểm tra artifact, thử tải và đánh giá |
| `docker/`, `docker-compose.yml` | Hạ tầng tuỳ chọn và bootstrap portable |

Route/controller gọi service; repository truy cập Prisma; adapter S3 dùng AWS SDK. Service độc lập Express. Frontend gọi mạng qua `api/`. Admin và `.bat` được Git bỏ qua; mã local không được đưa vào artifact public.

## Quyền và bảo mật

- Phiên dùng token ngẫu nhiên trong cookie HttpOnly, SameSite=Lax, Path=/; DB chỉ giữ SHA-256 token. Mật khẩu dùng Argon2id; phiên mặc định 168 giờ.
- Private chỉ chủ được xem/tải; sửa, thay tệp và xoá luôn cần quyền chủ. Tài liệu không được phép xem trả 404.
- `discoverableSql()` chỉ chọn Public và chủ chưa xoá. So trùng thêm tài liệu của chính người upload. Gợi ý kiểm lại quyền từ DB sau khi xếp hạng.
- POST/PUT/PATCH/DELETE cần `X-CSRF-Protection: 1`; Origin nếu có phải thuộc `ALLOWED_ORIGINS`. HTTPS dùng `COOKIE_SECURE=true`; chỉ tin proxy đã cấu hình.
- Auth mặc định 20 request/15 phút/IP; suggestions 60/phút/IP. Rate limit nằm trong RAM từng process.
- Helmet đặt header bảo mật. Log che mật khẩu/token/cookie và từ khoá tìm kiếm; không ghi chữ trích từ tệp. Audit giữ mặc định 90 ngày.

## Vòng đời tài liệu

| Thao tác | Thứ tự |
|---|---|
| Upload | Ghi tmp → kiểm định dạng/so trùng → PutObject → transaction metadata/fingerprint → dọn tmp |
| Thay tệp | Kiểm quyền/so trùng, loại chính tài liệu → object mới → commit phiên bản/fingerprint → xoá object cũ |
| Download | Kiểm phiên/quyền → GetObject → stream attachment |
| Xoá | Xoá metadata → xoá object; fingerprint/tương tác mất theo CASCADE |

PutObject lỗi không tạo metadata. DB lỗi sau PutObject sẽ dọn object mới; thay tệp thất bại giữ bản cũ. Xoá object lỗi được log, không đổi kết quả xoá metadata 204; không có worker tự dọn object mồ côi.

PDF/DOCX/PPTX tối đa 50 MiB, một tệp/request. Inspector kiểm đuôi, chữ ký và main part OOXML; không tin MIME phía client. Object key do server sinh; backend kiểm quyền trước khi stream, không trả URL S3 trực tiếp.

## Dữ liệu

Nguồn chuẩn: [schema.prisma](../backend/prisma/schema.prisma). MySQL dùng `utf8mb4_0900_ai_ci`, UUID và thời gian UTC.

| Bảng | Nội dung |
|---|---|
| `users`, `sessions` | Tài khoản, tuỳ chọn cá nhân hoá, trạng thái xoá và phiên |
| `documents` | Chủ, metadata, visibility, storage key và phiên bản tệp |
| `document_fingerprints` | Một dòng/tài liệu; SHA-256, hash chữ, MinHash, trạng thái và phiên bản |
| `document_ingestion_locks` | Dòng khoá dùng chung cho kiểm trùng/commit giữa các instance |
| `document_interactions` | Một dòng cho mỗi user/tài liệu/loại VIEW hoặc DOWNLOAD; thời điểm đầu/cuối |
| `audit_events` | Sự kiện nghiệp vụ không có FK để giữ dấu vết khi đối tượng bị xoá |

Chỉ fingerprint có phiên bản khớp tài liệu mới được dùng. Áp migration bằng `prisma migrate deploy`; backfill và dọn dữ liệu cũ nằm trong [hướng dẫn vận hành](WINDOWS_HOSTING.md).

## API

Thành công trả `{ data: ... }`; 204 không có body. Lỗi trả `{ error: { code, message, details, requestId } }`; lỗi trùng có thêm `duplicates`. Không trả stack trace, storage key hay email chủ tài liệu.

| Method/path | Quyền và kết quả |
|---|---|
| GET `/api/health`, `/api/health/ready` | Public; liveness/readiness |
| GET `/api/auth/me` | Public; `{ user }`, null khi chưa đăng nhập |
| POST `/api/auth/register`, `/api/auth/login` | Public + CSRF; user và session cookie |
| POST `/api/auth/logout` | CSRF; 204 |
| GET `/api/documents` | Public; danh sách Công khai |
| GET `/api/documents/mine` | User; danh sách của mình |
| GET `/api/documents/:id` | Được xem; thông tin tài liệu |
| POST `/api/documents` | User + CSRF; 201, tài liệu và `duplicateCheck` |
| PATCH `/api/documents/:id` | Owner + CSRF; cập nhật metadata |
| PUT `/api/documents/:id/file` | Owner + CSRF; thay tệp và trả `duplicateCheck` |
| GET `/api/documents/:id/download` | User + được xem; stream tệp |
| DELETE `/api/documents/:id` | Owner + CSRF; 204 |
| GET `/api/recommendations/home` | Public; strategy và gợi ý, limit 1–20 |
| GET `/api/documents/:id/related` | Được xem; tài liệu liên quan, limit 1–12 |
| GET `/api/recommendations/suggestions` | Public; tối đa 8 gợi ý tiêu đề |
| GET/PUT `/api/recommendations/settings` | User; đọc/đổi cá nhân hoá, PUT cần CSRF |
| DELETE `/api/recommendations/history` | User + CSRF; 204 |

Tìm kiếm nhận `q`, `fileType`, `sort`, `page`, `pageSize` (1–50, mặc định 12). Public có newest/title/relevance; mine có newest/title và visibility. SQL LIKE escape `%`, `_`, `!`; giao diện có từ khoá mặc định relevance. Body auth/metadata/settings từ chối trường lạ; độ dài tính theo Unicode code point.

DTO nằm tại [document.mapper.ts](../backend/src/modules/documents/document.mapper.ts) và [types.ts](../frontend/src/api/types.ts); mã lỗi tại [errors.ts](../backend/src/http/errors.ts).

## So trùng

SHA-256 được tính theo stream. Chữ được chuẩn hoá NFKC/chữ thường, giữ dấu tiếng Việt. MinHash v1 dùng cụm 5 từ, 128 hàm băm cố định, lưu 512 byte. `text_sha256` phát hiện cùng toàn bộ chữ khi trích đầy đủ. So sánh dùng tỷ lệ chưa làm tròn: cảnh báo từ 0,7, chặn **trên 0,85**; cấu hình `warn/off` cũ vẫn được nâng thành `block` cho web API.

| Phân tích | Giới hạn |
|---|---|
| Worker | 1 job chạy, 3 chờ; deadline 15 giây gồm cả chờ; heap old/young 192/32 MiB |
| PDF | Tối đa 10 MiB, 100 trang đầu; parser không chạy eval/render/canvas |
| DOCX/PPTX | 300 phần; 10 MiB XML/phần, tổng 32 MiB giải nén |
| Chữ | 50–20.000 từ; không lưu chữ thô vào DB |
| Ứng viên | Tối đa 2.000 tài liệu trong phạm vi có quyền so sánh |

Trạng thái chữ gồm OK, PARTIAL và SKIPPED. Không trích được chữ vẫn so SHA-256. BUSY/TIMEOUT/ERROR, lỗi truy vấn hoặc ứng viên bị cắt trả 503 để thử lại. Transaction khoá dòng ingest và kiểm lại cả tệp/chữ trước commit; trích chữ và PutObject nằm ngoài khoá.

Nguồn chuẩn: [duplicate.policy.ts](../backend/src/modules/duplicates/duplicate.policy.ts). Hành vi và tỷ lệ hiển thị cho người dùng nằm trong [README](../README.md).

## Cá nhân hoá và tìm kiếm

TF-IDF/cosine dùng **tiêu đề và mô tả**, đếm tiêu đề hai lần khi tạo vector; không dùng chữ trích từ tệp. Chỉ mục tối đa 5.000 Public mới nhất, làm mới mỗi 10 phút. Chỉ mục cũ vẫn phải qua kiểm quyền SQL trước khi trả kết quả.

| Bề mặt | Xếp hạng |
|---|---|
| Home có lịch sử | 0,5 sở thích + 0,3 phổ biến + 0,2 mới; loại tài liệu của mình/đã tương tác |
| Home chưa có lịch sử | 0,6 phổ biến + 0,4 mới; chưa có popularity dùng newest |
| Liên quan | 0,8 cosine + 0,1 phổ biến + 0,1 mới; cosine ≥ 0,10; loại nguồn |
| Relevance | Mức khớp truy vấn trước; sau đó 0,5 sở thích + 0,25 phổ biến + 0,25 mới |
| Suggestions | Đầu tiêu đề → đầu từ → chứa; rồi phổ biến/mới; không cá nhân hoá |

Tìm không dấu và khớp chuỗi con; tiêu đề khớp được ưu tiên hơn chỉ khớp mô tả. Chỉ 200 ứng viên đầu được xếp lại; phần đuôi theo SQL, giữ phân trang không trùng/thiếu. Autocomplete debounce 250 ms, huỷ request cũ và hỗ trợ bàn phím.

Lịch sử chỉ ghi sau response thành công, cho người opt-in xem/tải Public của người khác. Lặp chỉ cập nhật `lastAt`; VIEW nặng 1, DOWNLOAD nặng 2, giảm nửa sau 30 ngày. Hồ sơ lấy 50 tương tác mới nhất, giữ 100 term; loại kết quả đã tương tác trong toàn bộ 90 ngày. Tắt cá nhân hoá xoá lịch sử trong cùng transaction; không lưu query tìm kiếm.

Lỗi ranking: home về newest, related/suggestions trả rỗng, search dùng thứ tự SQL. Nguồn chuẩn: [ranking.policy.ts](../backend/src/modules/recommendations/ranking.policy.ts).

## Vận hành và cấu hình

| Cổng local | Vai trò |
|---|---|
| 3000 | Backend |
| 3001/3002/3003 | Controller, gateway chia sẻ, admin API |
| 5173 | Vite và quản trị |
| 3306/9000 | MySQL/S3-compatible |

Các dịch vụ qua launcher chỉ bind loopback. Gateway phục vụ frontend build và proxy `/api`; chặn `/admin`, `/__local`, `/api/dev`, kiểm Origin tunnel và đặt cookie Secure. Controller kiểm Host/Origin/capability/phiên developer. Admin dùng tài khoản scrypt trên đĩa, cookie riêng tối đa 8 giờ.

Hai chế độ dùng chung stack; khởi động mới build cả backend/frontend. Stop server dừng cả admin; stop admin giữ server đang chạy. Launcher chỉ dừng process/container do nó quản lý. Log NDJSON xoay 2 MiB; metrics local ghi snapshot mỗi 5 giây.

Cấu hình tại [backend/.env.example](../backend/.env.example), validate bởi [env.ts](../backend/src/config/env.ts). Nhóm chính: DB (`DATABASE_URL`), storage (`S3_*`/AWS credentials hoặc IAM Role), cookie/proxy, `UPLOAD_TMP_DIR`, `SERVE_FRONTEND`, `RECOMMENDATIONS_ENABLED`. `BTL_LOCAL_PRODUCTION=1` cho backend con chạy bản build production; controller/Vite vẫn local. Launcher từ chối DB/storage ngoài loopback.

Trên máy chủ, đặt `NODE_ENV=production`, áp migration/khởi tạo bucket rồi chạy `npm run build` và `npm --prefix backend start`; `SERVE_FRONTEND=true` phục vụ SPA build. DB/storage được cấu hình độc lập với host Node. `/api/health` kiểm sống; `/api/health/ready` kiểm cả DB/storage. Shutdown có deadline 30 giây.

## Giới hạn

Không OCR/quét virus; chữ PDF có thể trích sai do font. So trùng có giới hạn trích chữ và tập ứng viên; chỉ mục gợi ý có độ trễ refresh. Rate limit/chỉ mục nằm riêng từng process. Kết quả đo local không đại diện cho hạ tầng AWS.

Cách chạy, sao lưu và bảo trì: [WINDOWS_HOSTING](WINDOWS_HOSTING.md). Các lệnh kiểm chứng: [MILESTONES](MILESTONES.md).
