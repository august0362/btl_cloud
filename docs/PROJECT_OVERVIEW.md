# PROJECT OVERVIEW — Kho Tài Liệu Học Tập (BTL Cloud, INT3319)

> Tài liệu tổng hợp cho **developer/thành viên nhóm**: nội dung, kiến trúc, đặc tả và sơ đồ của dự án trong một file. Tổng hợp từ [CONTEXT.md](CONTEXT.md) (yêu cầu), [ARCHITECTURE.md](ARCHITECTURE.md) (thiết kế, hợp đồng API) và [MILESTONES.md](MILESTONES.md) (tiến độ), đối chiếu với mã nguồn tại commit `e57db90` (2026-10-29).
>
> Đây là bản tóm tắt. Khi cần chi tiết hoặc khi có mâu thuẫn: **§A7 trong ARCHITECTURE là hợp đồng API duy nhất**, còn hành vi thực tế theo mã nguồn và Nhật ký thay đổi baseline (CR-001…CR-008). Các điểm đã chỉnh trong tài liệu gốc cho khớp mã nguồn được liệt kê ở [§15](#15-đồng-bộ-tài-liệu-gốc-với-mã-nguồn).
>
> **Xem sơ đồ:** các khối ` ```mermaid ` được GitHub tự vẽ; trong VS Code cài extension `bierner.markdown-mermaid` rồi bấm `Ctrl+Shift+V`.

**Mục lục:** [1 Giới thiệu](#1-giới-thiệu) · [2 Phạm vi](#2-phạm-vi) · [3 Tác nhân và quyền](#3-tác-nhân-và-ma-trận-quyền) · [4 Yêu cầu chức năng](#4-yêu-cầu-chức-năng) · [5 Phi chức năng](#5-yêu-cầu-phi-chức-năng-chính) · [6 Kiến trúc](#6-kiến-trúc) · [7 Dữ liệu](#7-dữ-liệu-và-lưu-trữ) · [8 Bảo mật](#8-xác-thực-phân-quyền-bảo-mật) · [9 API](#9-đặc-tả-rest-api) · [10 Luồng xử lý](#10-luồng-xử-lý-chính) · [11 Frontend](#11-frontend) · [12 Chạy local](#12-môi-trường-local-và-cấu-hình) · [13 AWS](#13-kiến-trúc-aws-mục-tiêu-m5-chưa-triển-khai) · [14 Kiểm thử, tiến độ](#14-kiểm-thử-ci-và-tiến-độ) · [15 Đồng bộ tài liệu](#15-đồng-bộ-tài-liệu-gốc-với-mã-nguồn)

---

## 1. Giới thiệu

**Sản phẩm.** Website cho học sinh, sinh viên lưu trữ, tìm kiếm và chia sẻ tài liệu học tập (PDF, DOCX, PPTX, tối đa 50 MiB). Mỗi người có một kho cá nhân; mỗi tài liệu là **Công khai (Public)**: ai cũng tìm thấy, phải đăng nhập mới tải được; hoặc **Riêng tư (Private)**: chỉ chủ sở hữu thấy.

**Bài toán.** Tài liệu nằm rải rác trên máy cá nhân, nhóm chat, nhiều dịch vụ khác nhau nên khó tìm lại, khó chia sẻ có chọn lọc, dễ mất. Hệ thống cung cấp lưu trữ tập trung, chia sẻ có kiểm soát và tìm kiếm theo từ khoá; mọi lượt tải xuống gắn với một tài khoản.

**Bối cảnh học phần.** Bài tập lớn môn Điện toán đám mây (INT3319). Phần chấm CLO4 yêu cầu kiến trúc AWS có: VPC public/private trên ≥ 2 AZ, máy chủ ứng dụng trong private subnet, ≥ 2 loại lưu trữ, một CSDL, IAM Role (không nhúng access key), cân bằng tải + tự mở rộng, giám sát có alarm, dự toán chi phí. CLO2 yêu cầu giải thích được mọi lựa chọn công nghệ.

**Trạng thái hiện tại (2026-10-29).**

| Hạng mục | Trạng thái |
|---|---|
| Local prototype (M1–M4) | Chạy được đầy đủ trên Windows (`run.bat`) hoặc Docker Compose; đã kiểm chứng tự động |
| M4-07 (lỗi storage thật), M4-08 (nhiều instance) | Hoãn theo CR-005 |
| AWS (M5) | **Chưa làm**, chưa provisioning gì; mới có thiết kế mục tiêu ([§13](#13-kiến-trúc-aws-mục-tiêu-m5-chưa-triển-khai)) |
| PR tích hợp | `chore/integration-m4` → `main`, PR #1 đang mở, CI `ci-required` PASS |

---

## 2. Phạm vi

### 2.1 MVP

| Nhóm | Bao gồm |
|---|---|
| Tài khoản | Đăng ký (email, mật khẩu, tên hiển thị), đăng nhập, đăng xuất; phiên qua cookie |
| Khám phá | Guest/User tìm và duyệt tài liệu Public (từ khoá, loại tệp, sắp xếp, phân trang); xem chi tiết metadata |
| Tải xuống | User tải tài liệu Public của bất kỳ ai và tài liệu Private của mình |
| Tải lên | PDF/DOCX/PPTX ≤ 50 MiB; bắt buộc chọn Public/Private |
| Kho cá nhân | Danh sách tài liệu của tôi; sửa tiêu đề/mô tả/chế độ; thay tệp (giữ chế độ); xoá vĩnh viễn |
| Vận hành | Health check (liveness/readiness), log JSON, nhiều instance dùng chung DB và storage |

### 2.2 Ngoài phạm vi

Bình luận, đánh giá, theo dõi, chia sẻ cho người cụ thể; tìm kiếm toàn văn, AI search, xem trước tệp; quét virus, kiểm duyệt; trang quản trị, vai trò admin; quên/đổi mật khẩu, xác minh email, SSO; xoá tài khoản, thùng rác, lịch sử phiên bản; hạn mức dung lượng, thống kê; app di động, đa ngôn ngữ.

### 2.3 Giai đoạn

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| M0 | Thiết kế: yêu cầu, kiến trúc, API, UX | Owner đã duyệt |
| M1–M2 | Backend, DB, storage | Xong |
| M3 | Frontend | Xong |
| M4 | Tích hợp và kiểm chứng local | Xong (trừ M4-07/08 hoãn); chờ owner gate M4-12/M4-G |
| M5 | Chuẩn bị AWS: kế hoạch EC2/ALB/ASG/RDS/S3/IAM/CloudWatch, thử tải, chi phí | Chưa làm |

Nguyên tắc chuyển giai đoạn: local → AWS **chỉ đổi cấu hình** (biến môi trường), không đổi kiến trúc hay mã nguồn (NFR-POR-01).

---

## 3. Tác nhân và ma trận quyền

- **Guest**: không có phiên hợp lệ.
- **User**: có phiên hợp lệ.
- **Owner**: vai trò theo từng tài liệu (`users.id = documents.owner_id`), backend kiểm ở mỗi request. Không có admin.

| Hành động | Guest | User không phải owner | Owner |
|---|---|---|---|
| Tìm kiếm / xem metadata tài liệu Public | ✅ | ✅ | ✅ |
| Tải xuống tài liệu Public | ❌ 401 | ✅ | ✅ |
| Xem / tải tài liệu Private của **mình** | — | — | ✅ |
| Xem / tải tài liệu Private của **người khác** | ❌ xem 404 · tải 401 | ❌ 404 | — |
| Thấy tài liệu Private trong tìm kiếm công khai | ❌ | ❌ | ❌ (chỉ trong kho cá nhân) |
| Tải lên | ❌ 401 | ✅ (trở thành owner) | ✅ |
| Xem kho cá nhân | ❌ 401 | ✅ (chỉ của mình) | ✅ |
| Sửa metadata / đổi chế độ / thay tệp / xoá | ❌ 401 | ❌ Public 403 · Private 404 | ✅ |

Tài liệu Private của người khác được đối xử **như không tồn tại** (404) để không lộ sự tồn tại; thao tác trái phép trên tài liệu Public trả 403.

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

---

## 4. Yêu cầu chức năng

### 4.1 Quy tắc nghiệp vụ

| ID | Quy tắc |
|---|---|
| BR-01 | Tài liệu Private chỉ owner xem metadata và tải xuống được |
| BR-02 | Chỉ owner được sửa, thay tệp, xoá |
| BR-03 | Guest được tìm và xem metadata tài liệu Public, **không** được tải xuống |
| BR-04 | Khi tải lên phải chọn tường minh Public/Private; không có giá trị mặc định |
| BR-05 | Chỉ PDF, DOCX, PPTX; 1 byte … 52 428 800 byte (50 × 1024²); loại tệp xác minh theo **nội dung**, không tin đuôi hay MIME client gửi |
| BR-06 | Upload dở dang/thất bại **không bao giờ** xuất hiện ở danh sách, tìm kiếm hay endpoint nào |
| BR-07 | Thay tệp giữ nguyên chế độ hiển thị; thay thất bại thì tệp cũ vẫn tải được |
| BR-08 | Xoá là vĩnh viễn: metadata mất ngay; object được xoá best-effort; không khôi phục |
| BR-09 | Mọi xác thực và phân quyền thực thi ở backend; UI ẩn/hiện nút chỉ để tiện |
| BR-10 | Email là định danh đăng nhập, duy nhất, không phân biệt hoa thường |
| BR-11 | Tìm kiếm công khai chỉ trả tài liệu Public (kể cả Public của chính người tìm) |

### 4.2 Danh sách FR

| FR | Tên | Nội dung chính | API | Trang |
|---|---|---|---|---|
| FR-01 | Đăng ký, đăng nhập, đăng xuất | Đăng ký xong tự đăng nhập; phiên 7 ngày, cookie HttpOnly; sai email/mật khẩu → **một** thông báo chung; email trùng → "Email đã được sử dụng" | API-03…06 | P-02, P-03, header |
| FR-02 | Tìm và duyệt tài liệu Public | Từ khoá ≤ 100 ký tự khớp chuỗi con trong tiêu đề/mô tả, không phân biệt hoa thường/dấu; `%`, `_` hiểu theo nghĩa đen; 12 mục/trang; không lộ email người đăng | API-07, 09 | P-01, P-04 |
| FR-03 | Bắt buộc đăng nhập để tải xuống | Tệp chỉ phục vụ qua backend; tên gốc tiếng Việt giữ đúng; nội dung khớp từng byte | API-03, 13 | P-01, P-04, P-05 |
| FR-04 | Tải lên PDF/DOCX/PPTX ≤ 50 MiB | Tiêu đề 1–200, mô tả ≤ 2000; có tiến độ và nút huỷ; > 50 MiB → 413, giả đuôi → 415; lỗi bất kỳ → không có tài liệu "ma" | API-10 | P-06 |
| FR-05 | Chọn tường minh Public/Private | Form không chọn sẵn; API thiếu `visibility` → 400 | API-10 | P-06 |
| FR-06 | Kho tài liệu cá nhân | Mọi tài liệu của mình, lọc theo chế độ/loại, phân trang | API-08 | P-05 |
| FR-07 | Sửa tiêu đề, mô tả, chế độ | Đổi chế độ có hiệu lực ngay; Private → Public phải xác nhận | API-11 | P-07 |
| FR-08 | Thay tệp, giữ chế độ | `id`, metadata, chế độ giữ nguyên; `fileVersion` + 1; lỗi → vẫn trỏ tệp cũ | API-12 | P-07 |
| FR-09 | Xoá vĩnh viễn | Xác nhận "không thể hoàn tác"; sau xoá mọi endpoint trả 404 | API-14 | P-04, P-05, P-07 |

Tiêu chí chấp nhận chi tiết (AC-01.1 … AC-09.3): [CONTEXT §C4](CONTEXT.md#c4-yêu-cầu-chức-năng).

---

## 5. Yêu cầu phi chức năng chính

**M** = bắt buộc theo đề bài/đề xuất · **P** = mục tiêu do thiết kế đề xuất.

| Nhóm | Yêu cầu | Loại | Cách đáp ứng |
|---|---|---|---|
| Bảo mật | Phân quyền ở backend theo §3 | M | `document.policy.ts` + test ma trận 82 ca |
| Bảo mật | Mật khẩu argon2id; phiên opaque trong cookie HttpOnly, DB chỉ lưu hash; chống CSRF | P | [§8](#8-xác-thực-phân-quyền-bảo-mật) |
| Bảo mật | Không access key AWS trong mã; IAM Role trên AWS | M | SDK lấy credentials từ môi trường/instance profile |
| Bảo mật | Bucket private; tải xuống qua backend; kiểm loại tệp theo nội dung | P | [§7.4](#74-nguyên-tắc-object-storage), [§10.6](#106-kiểm-tra-nội-dung-tệp-fileinspector) |
| Sẵn sàng | ≥ 2 instance trên 2 AZ sau ALB; RDS Single-AZ là điểm lỗi đơn được chấp nhận | M | Thiết kế M5 |
| Sẵn sàng | Liveness không phụ thuộc DB/storage | P | `/api/health` vs `/api/health/ready` |
| Tin cậy | Upload/replace thất bại không để lại tài liệu dở; tắt êm khi SIGTERM | M/P | "Ghi object trước, commit DB sau"; graceful shutdown 30 s |
| Mở rộng | Stateless: nhiều instance dùng chung DB + storage; upload không đệm cả tệp trong RAM | M/P | Phiên trong MySQL; multer ghi đĩa tạm; stream lên S3 |
| Mở rộng | ASG tự mở rộng, demo được khi tải tăng | M | Kế hoạch M5 |
| Bảo trì | TypeScript strict, modular monolith, lint trong CI, unit/integration/E2E | P | [§14](#14-kiểm-thử-ci-và-tiến-độ) |
| Khả dụng | UI tiếng Việt, dùng được từ 360 px, hướng tới WCAG 2.1 AA; upload có tiến độ + huỷ | P | UI suite axe + bàn phím |
| Quan sát | Log JSON có `requestId`, `instanceId`; không log mật khẩu/cookie; ≥ 1 CloudWatch alarm kích hoạt thử | P/M | pino; alarm ở M5 |
| Di chuyển | Local → AWS chỉ đổi biến môi trường, validate khi khởi động | M | `config/env.ts` (zod) |
| Chi phí | Dự toán chi phí tháng | M | M5-09 (đề xuất ban đầu ~63,96 USD/tháng, cần đối chiếu lại) |

---

## 6. Kiến trúc

### 6.1 Technology stack (phiên bản ghim trong lockfile)

| Tầng | Lựa chọn | Lý do |
|---|---|---|
| Frontend | React 19.3 + TypeScript 5.9 + Vite 8; React Router 7 | SPA build tĩnh, backend phục vụ cùng origin |
| Giao diện | CSS thuần + CSS Modules + design token (`styles/tokens.css`), sáng/tối theo hệ thống | Không UI library, CSP chặt |
| Backend | Node.js 24 LTS + TypeScript + Express 5.3 | Express 5 tự chuyển lỗi async tới error middleware |
| Validation | zod 3 | Một schema vừa validate vừa sinh type |
| ORM / DB | Prisma 6.19 + Prisma Migrate / MySQL 8.4 (`utf8mb4_0900_ai_ci`) | Migration có version; local và RDS cùng major |
| Object storage | AWS SDK v3 (`client-s3`, `lib-storage`), **một adapter** cho mọi S3-compatible | Local SeaweedFS ↔ AWS S3 chỉ đổi cấu hình |
| Upload / kiểm tệp | multer (disk storage), yauzl (đọc central directory ZIP) | Không đệm 50 MiB trong RAM; phân biệt DOCX/PPTX thật |
| Bảo mật | argon2 (argon2id), helmet, cookie-parser, express-rate-limit | |
| Log | pino + pino-http, JSON ra stdout | Dễ gửi lên CloudWatch |
| Test | Vitest 5 + Supertest; React Testing Library; Playwright + axe | |
| Hạ tầng local | Docker Compose (`mysql:8.4`, `chrislusf/seaweedfs:4.48`) hoặc `run.bat` bản portable | MinIO ngừng phát hành image miễn phí (CR-001) |

**Không dùng (có chủ đích):** microservices, Kubernetes, Redis, Elasticsearch, queue, JWT, CORS, presigned URL, UI/state library, package dùng chung FE–BE.

### 6.2 Quyết định thiết kế chính

| ID | Quyết định | Lý do · đánh đổi |
|---|---|---|
| D-01 | **Modular monolith**: một process Node phục vụ API + SPA | Nhóm 4 người hiểu hết; ASG chỉ một loại instance |
| D-02 | **Cùng origin**: production Express phục vụ `frontend/dist`; dev dùng Vite proxy `/api` | Cookie SameSite chạy tự nhiên, không cần CORS |
| D-03 | **Phiên opaque lưu DB + cookie HttpOnly** | Thu hồi ngay khi đăng xuất; instance stateless · mỗi request thêm 1 truy vấn PK |
| D-04 | **CSRF** = SameSite=Lax + header bắt buộc `X-CSRF-Protection: 1` + allowlist `Origin` | Không cần endpoint cấp token |
| D-05 | **Upload/download đi qua backend**; bucket private | Một điểm kiểm quyền và kiểm nội dung · băng thông qua EC2 |
| D-06 | **Object key bất biến**: `documents/{documentId}/{objectId}.{ext}` | Thay tệp không ghi đè; key không chứa dữ liệu người dùng |
| D-07 | **Bù trừ best-effort**; xoá object lỗi ghi WARN `storage.orphan` | DB và storage không có transaction chung; chấp nhận object mồ côi |
| D-08 | **Last write wins** khi thay tệp; `file_version` chỉ là bộ đếm | Không khoá lạc quan, không 409 |
| D-10 | **Không worker định kỳ**; lúc khởi động dọn `UPLOAD_TMP_DIR` và xoá phiên hết hạn | Đơn giản; request vẫn kiểm hạn phiên |
| D-11 | ID UUID v4 `CHAR(36)`, sinh ở ứng dụng | Không đoán được |
| D-12 | Tìm kiếm `LIKE '%q%'` trên `title`/`description` | Đủ cho quy mô demo; nâng FULLTEXT khi cần |
| D-14 | Tách **liveness** `/api/health` và **readiness** `/api/health/ready` | ALB/ASG không thay máy hàng loạt khi RDS/S3 lỗi |
| D-15/16 | Không package dùng chung FE–BE; `backend/`, `frontend/` có lockfile riêng; root không dependency | Hai nhánh làm độc lập; tương thích CI |
| D-17/18 | Cấu hình qua biến môi trường validate bằng zod; log JSON stdout | Cùng artifact chạy local và AWS |

### 6.3 Sơ đồ ngữ cảnh

```mermaid
flowchart LR
  guest["Guest<br/>trình duyệt"]
  user["User<br/>trình duyệt"]
  subgraph sys["Hệ thống Lưu trữ và Chia sẻ Tài liệu"]
    app["Ứng dụng web<br/>React SPA + REST API"]
    db[("MySQL / RDS<br/>users, sessions, documents")]
    obj[("Object storage S3-compatible<br/>SeaweedFS local / S3 private")]
  end
  ops["Nhóm vận hành<br/>log, health, CloudWatch"]
  guest -->|"tìm kiếm, xem metadata Public"| app
  user -->|"đăng nhập, upload, download, quản lý"| app
  app -->|"SQL qua Prisma"| db
  app -->|"S3 API"| obj
  ops -.->|"giám sát"| app
```

### 6.4 Sơ đồ container

```mermaid
flowchart LR
  browser["Trình duyệt<br/>React SPA"]
  subgraph app["Backend process: Node.js 24 + Express 5, chạy N instance giống nhau"]
    spa["Static SPA<br/>frontend/dist"]
    apiC["REST API /api/*"]
  end
  db[("MySQL 8.4<br/>users, sessions, documents")]
  obj[("Object storage<br/>documents/docId/objId.ext")]
  tmp[("Đĩa tạm cục bộ<br/>UPLOAD_TMP_DIR")]
  browser -->|"GET /, /assets/*"| spa
  browser -->|"fetch JSON, XHR multipart, download"| apiC
  apiC --> db
  apiC --> obj
  apiC --> tmp
```

Instance không giữ trạng thái: phiên nằm trong bảng `sessions`, byte tệp nằm trong object storage, tệp tạm chỉ sống trong một request. Rate limit đăng nhập nằm trong bộ nhớ từng instance (giới hạn thực tế = N × ngưỡng, chấp nhận cho MVP).

### 6.5 Kiến trúc backend

**Phân tầng và quy tắc phụ thuộc.** Controller gọi service; service chứa nghiệp vụ, policy và giao thức storage; chỉ repository dùng `PrismaClient`; chỉ `storage/s3-object-storage.ts` import `@aws-sdk/*`; service không import Express. Mọi quyết định phân quyền tài liệu nằm trong `document.policy.ts`.

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

**Pipeline xử lý request** (thứ tự đăng ký trong [backend/src/app.ts](../backend/src/app.ts)):

```mermaid
flowchart TB
  in(["Request vào một instance"]) --> rid["1 requestId"] --> rlog["2 requestLogger"] --> hel["3 helmet"] --> json["4 express.json tối đa 16 KB"] --> ck["5 cookieParser"]
  ck --> isapi{"Đường dẫn bắt đầu /api ?"}
  isapi -->|"Không"| st["static + SPA fallback<br/>khi SERVE_FRONTEND=true"]
  isapi -->|"Có"| unsafe{"POST, PUT, PATCH, DELETE ?"}
  unsafe -->|"Có"| csrf["6 csrfGuard"]
  unsafe -->|"Không"| sl["7 sessionLoader"]
  csrf --> sl
  sl --> match{"8 Khớp route ?"}
  match -->|"Không"| nf["404 ROUTE_NOT_FOUND"]
  match -->|"Có"| chain["authRateLimit → requireAuth → document.loader<br/>→ upload.middleware → validate → controller"]
  chain --> ok(["Response 2xx"])
  json -.->|"JSON lỗi / quá lớn"| eh["errorHandler<br/>envelope lỗi + xoá tệp tạm"]
  csrf -.->|"403"| eh
  chain -.->|"401, 403, 404, 413, 415, 429, 500, 503"| eh
```

Hệ quả quan trọng: **xác thực và phân quyền chạy trước khi nhận tệp upload**, nên request chưa đăng nhập hoặc không phải owner không thể khiến server ghi 50 MiB xuống đĩa.

**Đặc tả module backend**

| Module | Trách nhiệm | Lỗi phát sinh |
|---|---|---|
| `config/env.ts` | Parse + validate biến môi trường bằng zod → `Config` | Thiếu/sai → log tên biến, `exit(1)` |
| `http/middleware/*` | requestId, log, header bảo mật, `csrfGuard`, `sessionLoader`, `requireAuth`, `noStore`, `errorHandler` | 403 `CSRF_REJECTED`, 401, 404 `ROUTE_NOT_FOUND` |
| `http/static.ts` | Phục vụ SPA khi `SERVE_FRONTEND=true`; `/assets/*` cache immutable, fallback `index.html` | Thiếu dist → cảnh báo, chỉ phục vụ API |
| `modules/health` | API-01 liveness, API-02 readiness (`SELECT 1` + HeadBucket, timeout 2 s) | 503 `SERVICE_UNAVAILABLE` |
| `modules/auth`, `modules/users` | Đăng ký, đăng nhập, đăng xuất, nạp phiên; argon2id; cookie; rate limit | `EMAIL_ALREADY_EXISTS`, `INVALID_CREDENTIALS`, `RATE_LIMITED` |
| `documents/document.policy.ts` | `canView`, `canManage` — hàm thuần trả `ALLOW` / `NOT_FOUND` / `FORBIDDEN` | — |
| `documents/document.loader.ts` | Nạp tài liệu theo `:id`, áp policy **trước khi đọc body** | 404 / 403; route multipart thì xả body |
| `documents/documents.service.ts` | Tìm, liệt kê, xem, tạo, sửa, thay, xoá, mở download; giao thức DB ↔ storage | `STORAGE_UNAVAILABLE`, `DOCUMENT_NOT_FOUND` |
| `files/upload.middleware.ts` | multer: đúng 1 tệp vào `UPLOAD_TMP_DIR`, ≤ 52 428 800 byte, tên UTF-8 | 413 `FILE_TOO_LARGE`, 400 |
| `files/file-inspector.ts` | Xác định loại theo đuôi + chữ ký nội dung; làm sạch tên | 415, 400 `EMPTY_FILE` |
| `files/storage-keys.ts`, `content-disposition.ts` | Sinh key bất biến; header tải xuống `filename` + `filename*` | — |
| `storage/*` | `ObjectStorage` interface: `putObject`, `getObject`, `deleteObject`, `checkHealth` | `StorageError { UNAVAILABLE \| NOT_FOUND }` |
| `cleanup/tmp-sweeper.ts`, `lifecycle.ts` | Dọn tệp tạm; graceful shutdown (đóng server → disconnect DB → thoát, tối đa 30 s) | — |
| `lib/logger.ts` | pino JSON, redact cookie/`set-cookie`/password | — |

### 6.6 Kiến trúc frontend

```mermaid
flowchart TB
  main["main.tsx"] --> app["App.tsx"]
  app --> router["BrowserRouter"]
  router --> toast["ToastProvider"]
  toast --> auth["AuthProvider<br/>user, status"]
  auth --> layout["AppLayout<br/>SkipLink, header, main, footer"]
  layout --> routes["Routes"]
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

| Thư mục | Trách nhiệm |
|---|---|
| `src/api/` | **Chỉ nơi được gọi mạng.** `client.ts` (`fetch`, `credentials: 'same-origin'`, tự gắn `X-CSRF-Protection: 1` cho request ghi, mở `{data}`, phát sự kiện `auth:unauthorized` khi 401); `upload.ts` (XHR có `onProgress`, huỷ bằng `AbortSignal`); `auth.ts`, `documents.ts`, `types.ts` (type viết tay khớp §A7) |
| `src/auth/` | `AuthProvider` gọi API-03 khi khởi động, giữ `user` + `status` (không dùng localStorage); guard `RequireAuth`, `GuestOnly` |
| `src/components/` | UI thuần, không gọi API: layout, `FileDropzone`, `SearchBar`, `Pagination`, `VisibilityPicker`, `ToastProvider`, dialog… |
| `src/pages/` | Ghép component, gọi API qua `api/*` hoặc hook |
| `src/hooks/` | `useResource`, `useDocumentFilters` (URL là nguồn sự thật của bộ lọc), `useUploadTask`, `useDownload`, `useDeleteDocument`, `usePageTitle`, `useToast` |
| `src/lib/` | `validation` (khớp quy tắc server), `errorMessages` (mã lỗi → tiếng Việt), `format` (kích thước/ngày kiểu vi-VN), `safeRedirect`, `constants` (`MAX_UPLOAD_BYTES`) |

### 6.7 Cấu trúc repo

```text
/
├── README.md                  runbook ngắn: chạy, kiểm thử, lỗi thường gặp
├── package.json               root không dependency; lint/build/test chạy qua scripts/run-all.mjs
├── run.bat                    Windows: bật MySQL + S3 (Docker hoặc portable), backend :3000, frontend :5173
├── docker-compose.yml         mysql:8.4 + seaweedfs:4.48 (S3 API map ra :9000)
├── docker/                    mysql/init/01-init.sql (tạo DB test, quyền shadow DB), seaweedfs/s3.json
├── scripts/                   run-all.mjs; verify/authz-matrix.mjs, verify/upload-matrix.mjs
├── docs/                      CONTEXT, ARCHITECTURE, MILESTONES, PROJECT_OVERVIEW (file này), PR_M4
├── .github/                   CODEOWNERS, workflows/ci.yml (job ci-required)
├── backend/
│   ├── prisma/                schema.prisma, migrations/ (init + drop_storage_cleanup_tasks)
│   ├── scripts/init-storage.ts   tạo bucket
│   ├── src/                   server.ts, app.ts, container.ts, config/, http/, modules/, storage/, cleanup/, db/, lib/
│   └── test/                  unit/, integration/, helpers/
└── frontend/
    ├── src/                   main.tsx, App.tsx, api/, auth/, components/, pages/, hooks/, lib/, styles/
    ├── e2e/                   Playwright với backend thật (:3000)
    └── ui-tests/              Playwright với API mock (responsive, axe, bàn phím)
```

---

## 7. Dữ liệu và lưu trữ

### 7.1 Dữ liệu nằm ở đâu

| Dữ liệu | Nơi lưu |
|---|---|
| Tài khoản (email, hash mật khẩu, tên hiển thị) | MySQL `users` |
| Phiên (SHA-256 của token, thời hạn); token gốc chỉ nằm trong cookie | MySQL `sessions` |
| Metadata tài liệu — **nguồn sự thật** về sự tồn tại và quyền truy cập | MySQL `documents` |
| Byte nội dung tệp; object chỉ có `Content-Type` | Object storage, key `documents/{documentId}/{objectId}.{ext}` |
| Tệp đang upload (sống tối đa trong một request) | Đĩa cục bộ `UPLOAD_TMP_DIR` (EBS trên AWS) |

### 7.2 ERD

Nguồn: [backend/prisma/schema.prisma](../backend/prisma/schema.prisma). InnoDB, `utf8mb4_0900_ai_ci`, `DATETIME(3)` lưu UTC, tên bảng/cột snake_case.

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

### 7.3 Index, truy vấn chính, bất biến

| Thao tác | Truy vấn | Index |
|---|---|---|
| Nạp phiên | `sessions JOIN users WHERE sessions.id = ?` | PK |
| Đăng nhập | `users WHERE email = ?` | `uq_users_email` |
| Tìm công khai | `WHERE visibility='PUBLIC' [AND (title LIKE ? OR description LIKE ?)] [AND file_type=?] ORDER BY created_at DESC, id DESC LIMIT/OFFSET` + `COUNT(*)` | `idx_documents_visibility_created` |
| Kho cá nhân | `WHERE owner_id=? [AND visibility=?] …` | `idx_documents_owner_created` |
| Dọn phiên lúc khởi động | `DELETE FROM sessions WHERE expires_at < NOW(3) LIMIT 1000` (lặp theo lô) | `idx_sessions_expires_at` |

- **INV-D1:** mọi bản ghi `documents` trỏ tới object đã ghi thành công → không có tài liệu dở dang (BR-06).
- **INV-D2:** `visibility` chỉ đổi qua API-11; API-12 không ghi cột này (BR-07).
- **INV-D3:** `storage_key` dạng `documents/{id}/{uuid}.{ext}`, `ext` khớp `file_type`.

**Migration:** Prisma Migrate, SQL commit trong `backend/prisma/migrations/`, không sửa migration đã áp dụng. `20261020100306_init` tạo schema; `20261023000000_drop_storage_cleanup_tasks` xoá bảng cleanup cũ (CR-007) → còn 3 bảng. Production: `prisma migrate deploy` chạy một lần trước rollout, migration phải tương thích ngược (expand → deploy → contract).

### 7.4 Nguyên tắc object storage

1. Bucket **private**: không ACL công khai, không presigned URL; mọi byte đi qua backend sau khi kiểm quyền.
2. **MySQL là nguồn sự thật**: tài liệu tồn tại ⇔ có bản ghi `documents`.
3. **Ghi object trước, commit metadata sau** (INV-D1).
4. **Không ghi đè object**: mỗi phiên bản tệp có key mới (D-06).
5. Xoá object best-effort; thất bại ghi WARN `{ event: 'storage.orphan', storageKey }`. Không hàng đợi tự thử lại, không worker.

| Mục | Giá trị |
|---|---|
| Bucket | `S3_BUCKET`: local `btl-cloud-documents`, test `btl-cloud-documents-test` (tạo bằng `npm --prefix backend run storage:init`) |
| Cách ghi | `lib-storage` `Upload` với `Body = fs.createReadStream(tmpPath)` (tự multipart cho tệp lớn) |
| Cấu hình S3 trên AWS (M5) | Block Public Access đầy đủ; BucketOwnerEnforced; SSE-S3; **tắt versioning** (bật thì DeleteObject chỉ tạo delete marker, trái BR-08); lifecycle huỷ multipart dở sau 1 ngày |

### 7.5 Vòng đời tài liệu

`Uploading`/`Replacing` là trạng thái tạm trong một request, không lưu trong bảng.

```mermaid
stateDiagram-v2
  [*] --> Uploading: API-10 hợp lệ
  Uploading --> Active: PutObject OK và INSERT OK
  Uploading --> [*]: lỗi bất kỳ, không có bản ghi
  Active --> Active: API-11 sửa metadata hoặc visibility
  Active --> Replacing: API-12
  Replacing --> Active: UPDATE OK, file_version tăng 1
  Replacing --> Active: lỗi, giữ nguyên tệp cũ
  Active --> Deleted: API-14 DELETE OK
  Deleted --> [*]
```

---

## 8. Xác thực, phân quyền, bảo mật

### 8.1 Phiên và mật khẩu

| Chủ đề | Thiết kế |
|---|---|
| Mô hình | Phiên opaque lưu DB + cookie HttpOnly. Không JWT, không Authorization header, không token trong JS/localStorage. FE biết trạng thái qua API-03 |
| Mật khẩu | argon2id (`memoryCost 19456 KiB`, `timeCost 2`, `parallelism 1`); không trim; 8–128 ký tự. Email không tồn tại vẫn chạy verify với hash giả để thời gian phản hồi tương đương |
| Token | `randomBytes(32)` base64url (43 ký tự); DB lưu `id = SHA-256(token)` |
| Thời hạn | `SESSION_TTL_HOURS` = 168 h (7 ngày), cố định, **không** gia hạn trượt |
| Xoay phiên | Đăng ký/đăng nhập khi đang có cookie → xoá phiên cũ trước khi tạo phiên mới (chống session fixation) |
| `sessionLoader` | Không cookie → Guest; không thấy / hết hạn → xoá cookie (và xoá dòng hết hạn) → Guest; hợp lệ → `req.auth = { userId, sessionId, user }` |
| Đăng xuất | DELETE theo hash, xoá cookie, luôn 204; cookie cũ vô hiệu trên mọi instance |

**Cookie:** tên `sid` (dev / production HTTP) hoặc `__Host-sid` (production HTTPS); `HttpOnly; SameSite=Lax; Path=/`; `Secure` chỉ khi `COOKIE_SECURE=true`; không đặt `Domain`; `Max-Age = SESSION_TTL_HOURS × 3600`.

### 8.2 Chống CSRF

Áp dụng cho mọi `/api/*` có phương thức POST, PUT, PATCH, DELETE (kể cả đăng ký/đăng nhập/đăng xuất):

1. **Bắt buộc** header `X-CSRF-Protection: 1`; thiếu/sai → 403 `CSRF_REJECTED`. Header tuỳ biến không thể gửi cross-origin khi không bật CORS.
2. Có header `Origin` thì phải thuộc `ALLOWED_ORIGINS`; không khớp → 403.
3. `SameSite=Lax` là lớp phòng thủ thêm. GET (kể cả tải xuống) không cần header.

### 8.3 Phân quyền tài liệu

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

- Danh sách luôn lọc ở SQL (`visibility='PUBLIC'` cho API-07, `owner_id = người gọi` cho API-08), không lọc sau khi lấy dữ liệu.
- `id` sai định dạng UUID → 404. `DocumentDto.owner` chỉ có `id` + `displayName`, không bao giờ có email.
- Chính sách nằm ở [document.policy.ts](../backend/src/modules/documents/document.policy.ts); thứ tự middleware trong [documents.routes.ts](../backend/src/modules/documents/documents.routes.ts): `requireAuth` → loader (`view`/`manage`) → `upload` → controller.

### 8.4 Các lớp bảo vệ khác

| Ranh giới | Mối đe doạ | Cơ chế |
|---|---|---|
| Internet → ALB | Nghe lén cookie | HTTPS + `Secure` (chốt ở M5, OD-05) |
| Đăng nhập | Dò mật khẩu | Rate limit 15 phút, `AUTH_RATE_LIMIT_MAX` (20)/IP/instance; đăng nhập chỉ đếm lần thất bại; 429 + `Retry-After` |
| Upload | Tệp giả, path traversal, tệp lớn | Giới hạn kích thước, chữ ký nội dung, key không lấy từ input, làm sạch tên |
| Download | XSS / MIME sniffing | `Content-Disposition: attachment` + `nosniff` + CSP |
| Trình duyệt | Clickjacking, script lạ | helmet; CSP `default-src 'self'` …, `frame-ancestors 'none'`; `Referrer-Policy: no-referrer`; HSTS khi `HSTS_ENABLED=true` |
| Redirect sau đăng nhập | Open redirect | `safeRedirect`: chỉ nhận path bắt đầu `/`, không `//` hoặc `/\` |
| App → S3/RDS (AWS) | Lộ credentials | IAM Role + IMDSv2; private subnet + security group + TLS |
| Log | Lộ bí mật | pino redact `cookie`, `set-cookie`, `password`; log `userId`, không log email |

---

## 9. Đặc tả REST API

Hợp đồng đầy đủ (ví dụ request/response từng endpoint): [ARCHITECTURE §A7](ARCHITECTURE.md#a7-rest-api-contract).

### 9.1 Quy ước chung

| Chủ đề | Quy ước |
|---|---|
| Base path | `/api`, tương đối, cùng origin; không version trong URL |
| Định dạng | JSON UTF-8; trường `camelCase`; enum viết HOA (`PUBLIC`, `PDF`), riêng `sort` viết thường (`newest`, `title`) |
| Thời gian | ISO 8601 UTC có mili giây |
| Null | Response luôn có đủ trường, nullable mang `null`; PATCH: bỏ qua = không đổi, `description: null` hoặc `""` = xoá mô tả |
| Trường lạ | Body JSON/multipart có trường lạ → 400 `UNKNOWN_FIELD`; query param lạ bị bỏ qua |
| Header | Request ghi bắt buộc `X-CSRF-Protection: 1`; response luôn có `X-Request-Id`; JSON có `Cache-Control: no-store` |
| Giới hạn | JSON ≤ 16 KB; multipart đúng 1 part tệp ≤ 52 428 800 byte, ≤ 5 part văn bản mỗi part ≤ 16 KB |

**Envelope.** Thành công: `{ "data": … }` (trừ 204 và tải xuống nhị phân). Lỗi:

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

FE rẽ nhánh theo `code`; `message` tiếng Việt là fallback; `details` luôn có (`[]` khi rỗng).

### 9.2 Endpoint

| ID | Method | Path | Quyền | CSRF | Thành công | Lỗi đặc thù |
|---|---|---|---|---|---|---|
| API-01 | GET | `/api/health` | Công khai | — | 200 `{status, instanceId, version, uptimeSeconds}` | — (không chạm DB/storage) |
| API-02 | GET | `/api/health/ready` | Công khai | — | 200 `{status, instanceId, checks}` | 503 `SERVICE_UNAVAILABLE` |
| API-03 | GET | `/api/auth/me` | Cookie tuỳ chọn | — | 200 `{user: UserDto \| null}` | không bao giờ 401 |
| API-04 | POST | `/api/auth/register` | Công khai | có | 201 `{user}` + `Set-Cookie` | 400, 409 `EMAIL_ALREADY_EXISTS`, 429 |
| API-05 | POST | `/api/auth/login` | Công khai | có | 200 `{user}` + `Set-Cookie` | 400, 401 `INVALID_CREDENTIALS`, 429 |
| API-06 | POST | `/api/auth/logout` | Cookie tuỳ chọn | có | 204 + xoá cookie | — (idempotent) |
| API-07 | GET | `/api/documents` | Công khai | — | 200 `Page<DocumentDto>` chỉ Public | 400 |
| API-08 | GET | `/api/documents/mine` | User | — | 200 `Page<DocumentDto>` của mình | 401, 400 |
| API-09 | GET | `/api/documents/{id}` | `canView` | — | 200 `DocumentDto` | 404 |
| API-10 | POST | `/api/documents` | User | có | 201 `DocumentDto` + `Location` | 401, 400, 413, 415, 503 |
| API-11 | PATCH | `/api/documents/{id}` | `canManage` | có | 200 `DocumentDto` | 401, 403, 404, 400 (`NO_CHANGES` khi `{}`) |
| API-12 | PUT | `/api/documents/{id}/file` | `canManage` (trước khi đọc body) | có | 200 `DocumentDto`, `fileVersion` + 1 | 401, 403, 404, 400, 413, 415, 503 |
| API-13 | GET | `/api/documents/{id}/download` | User + `canView` | — | 200 nhị phân, `attachment` | 401, 404, 503 trước khi stream |
| API-14 | DELETE | `/api/documents/{id}` | `canManage` | có | 204 (kể cả khi xoá object lỗi) | 401, 403, 404 |

Lỗi chung không lặp lại ở bảng: 500 `INTERNAL_ERROR`; request ghi thêm 403 `CSRF_REJECTED`; body JSON thêm 400 `INVALID_JSON`, 413 `PAYLOAD_TOO_LARGE`. `/api/documents/mine` được đăng ký trước `/api/documents/:id`.

### 9.3 Mã lỗi

| `code` | HTTP | Khi nào |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Dữ liệu/tham số/tệp không hợp lệ (kèm `details`) |
| `INVALID_JSON` | 400 | Body JSON không parse được |
| `UNAUTHENTICATED` | 401 | Chưa đăng nhập, phiên hết hạn/bị thu hồi |
| `INVALID_CREDENTIALS` | 401 | Sai email hoặc mật khẩu |
| `CSRF_REJECTED` | 403 | Thiếu header CSRF / `Origin` không được phép |
| `FORBIDDEN` | 403 | Không phải owner của tài liệu Public |
| `ROUTE_NOT_FOUND` | 404 | Đường dẫn `/api/*` không tồn tại |
| `DOCUMENT_NOT_FOUND` | 404 | Không tồn tại, `id` sai, hoặc Private của người khác |
| `EMAIL_ALREADY_EXISTS` | 409 | Đăng ký trùng email |
| `PAYLOAD_TOO_LARGE` | 413 | JSON / part văn bản > 16 KB |
| `FILE_TOO_LARGE` | 413 | Tệp > 52 428 800 byte |
| `UNSUPPORTED_FILE_TYPE` | 415 | Không phải PDF/DOCX/PPTX hợp lệ |
| `RATE_LIMITED` | 429 | Vượt giới hạn (kèm `Retry-After`) |
| `INTERNAL_ERROR` | 500 | Lỗi không lường trước (không trả stack cho client) |
| `STORAGE_UNAVAILABLE` | 503 | Object storage lỗi/không phản hồi |
| `SERVICE_UNAVAILABLE` | 503 | API-02: một thành phần phụ thuộc lỗi |

Chỉ có ở client: `NETWORK_ERROR` (fetch/XHR thất bại), `ABORTED` (người dùng huỷ upload).

### 9.4 Schema và validate

**`DocumentDto`**: `id`, `title`, `description` (string | null), `visibility`, `fileType`, `originalFilename`, `sizeBytes`, `fileVersion`, `owner { id, displayName }`, `isOwner`, `createdAt`, `updatedAt`, `fileUpdatedAt`. **`UserDto`** (chỉ trả cho chính người dùng): `id`, `email`, `displayName`, `createdAt`. **`Page<T>`**: `items`, `page`, `pageSize`, `totalItems`, `totalPages`.

| Trường | Quy tắc |
|---|---|
| `email` | Trim → chữ thường; 3–254 ký tự; đúng định dạng |
| `password` | Đăng ký 8–128, đăng nhập 1–128; không trim |
| `displayName` | Trim; 1–100; không ký tự điều khiển |
| `title` | Trim; 1–200; không ký tự điều khiển (kể cả xuống dòng) |
| `description` | Trim; 0–2000; `""` → `null`; cho phép `\n`, `\t` |
| `visibility` | `PUBLIC` \| `PRIVATE`; bắt buộc ở API-10 |
| `file` | Đúng 1 part tên `file`; 1…52 428 800 byte; nội dung theo [§10.6](#106-kiểm-tra-nội-dung-tệp-fileinspector) |
| `q` / `fileType` / `sort` | 0–100 ký tự; `PDF`\|`DOCX`\|`PPTX`; `newest` (mặc định) \| `title` |
| `page` / `pageSize` | 1–10 000 (mặc định 1) / 1–50 (mặc định 12) |

Độ dài chuỗi tính theo Unicode code point. Tìm kiếm escape `\`, `%`, `_` trước khi đưa vào `LIKE`.

---

## 10. Luồng xử lý chính

`FE` = SPA; `BE` = một instance backend bất kỳ; `DB` = MySQL; `OS` = object storage. Mọi luồng ghi đều đã qua CSRF → phiên → policy trước khi chạm storage; tệp tạm luôn được xoá trong `finally`.

### 10.1 Đăng ký / đăng nhập / đăng xuất

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

### 10.2 Tải lên (API-10), gồm luồng lỗi

| Bước | Hành động | Nếu lỗi | Để lại |
|---|---|---|---|
| U1 | CSRF, phiên, `requireAuth` | 403 / 401 | Không có gì; body chưa được đọc |
| U2 | multer ghi đúng 1 tệp vào `UPLOAD_TMP_DIR`, đếm byte | > 50 MiB → 413; > 1 tệp → 400; client huỷ | multer xoá tệp dở |
| U3 | Validate `title`, `description`, `visibility` | 400 | Tệp tạm bị xoá |
| U4 | FileInspector | 415 / 400 `EMPTY_FILE` | Tệp tạm bị xoá |
| U5 | Sinh `documentId` + key bất biến; PutObject | 503 `STORAGE_UNAVAILABLE` | Không có `documents` |
| U6 | INSERT `documents`, `file_version = 1` | Thử DeleteObject(key), ném lại lỗi DB gốc | Không có `documents`; object có thể mồ côi |
| U7 | Xoá tệp tạm; trả 201 | — | Tài liệu Active |

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

### 10.3 Tải xuống (API-13)

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

Header tải xuống: `Content-Type` = `mime_type`; `Content-Disposition: attachment; filename="<ASCII bỏ dấu>"; filename*=UTF-8''<tên gốc mã hoá>`; `Cache-Control: private, no-store`. Không hỗ trợ `Range`. Lỗi sau khi đã gửi header → huỷ kết nối.

### 10.4 Thay thế tệp (API-12) và xoá (API-14)

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

Hai lần thay tệp đồng thời đều có thể thành công; lần ghi sau thắng (D-08), có thể để lại object của lần bị ghi đè.

### 10.5 Ma trận lỗi DB ↔ storage

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

**Hạn chế được chấp nhận (CR-007):** object mồ côi có thể còn lại sau lỗi/crash, tra cứu qua log `storage.orphan`; không có cơ chế tự thu gom, không lịch sử phiên bản.

### 10.6 Kiểm tra nội dung tệp (FileInspector)

| # | Quy tắc | Lỗi |
|---|---|---|
| 1 | `sizeBytes == 0` | 400 `EMPTY_FILE` |
| 2 | Đuôi (chữ thường, sau khi làm sạch tên) ∈ {`pdf`, `docx`, `pptx`} | 415 |
| 3 | PDF: 5 byte đầu là `%PDF-` | 415 |
| 4 | DOCX/PPTX: 4 byte đầu `PK\x03\x04`; đọc central directory bằng yauzl (không giải nén, ≤ 10 000 entry); phải có `[Content_Types].xml` **và** `word/document.xml` (DOCX) / `ppt/presentation.xml` (PPTX) | 415 |
| 5 | `mimeType` suy từ `fileType`, **bỏ qua** `Content-Type` client gửi | — |
| 6 | Làm sạch tên: giải mã UTF-8 → basename → bỏ ký tự điều khiển và `"` → NFC → trim → cắt còn ≤ 255 (giữ đuôi) → rỗng thì `tai-lieu.<ext>` | — |

---

## 11. Frontend

### 11.1 Trang và điều hướng

| Page | Route | Guard | Nội dung | API |
|---|---|---|---|---|
| P-01 Khám phá | `/` | — | SearchBar (`q`, `fileType`, `sort`), lưới thẻ tài liệu Public, phân trang; trạng thái URL | API-07, tải xuống API-03 + 13 |
| P-02 Đăng nhập | `/login` | GuestOnly | Email, mật khẩu; quay lại `redirect` an toàn | API-05 |
| P-03 Đăng ký | `/register` | GuestOnly | Tên hiển thị, email, mật khẩu, xác nhận mật khẩu | API-04 |
| P-04 Chi tiết | `/documents/:id` | — | Metadata; nút theo vai trò (tải xuống / đăng nhập để tải / sửa, xoá nếu owner) | API-09, 13, 14 |
| P-05 Tài liệu của tôi | `/me/documents` | RequireAuth | Bảng (≥ 640 px) hoặc thẻ; lọc chế độ/loại; tải, sửa, xoá | API-08, 13, 14 |
| P-06 Tải lên | `/upload` | RequireAuth | Dropzone, tiêu đề tự điền từ tên tệp, mô tả, chọn chế độ (không chọn sẵn), thanh tiến độ, huỷ | API-10 |
| P-07 Chỉnh sửa | `/documents/:id/edit` | RequireAuth | Sửa thông tin; Private → Public cần xác nhận; thay tệp; xoá | API-09, 11, 12, 14 |
| P-08 Không tìm thấy | `*` | — | Trang 404 | — |

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

### 11.2 Trạng thái theo xác thực

| `AuthProvider` | Header | `RequireAuth` | `GuestOnly` |
|---|---|---|---|
| `loading` (đang gọi API-03) | Khung xám | Spinner | Spinner |
| `ready`, `user = null` | Khám phá · Đăng nhập · Đăng ký | Chuyển tới `/login?redirect=…` | Hiện trang |
| `ready`, có `user` | Khám phá · Tài liệu của tôi · Tải lên · tên · Đăng xuất | Hiện trang | Chuyển tới `/me/documents` |

- **Hết phiên giữa chừng:** `api/*` nhận 401 `UNAUTHENTICATED` → phát `auth:unauthorized` → `AuthProvider` đặt Guest, toast "Phiên đăng nhập đã hết hạn…", chuyển tới đăng nhập nếu đang ở trang cần đăng nhập.
- **Tải xuống:** `useDownload` gọi API-03 trước; còn phiên thì click `<a>` ẩn tới URL tải, không thì chuyển tới đăng nhập kèm `redirect`.

### 11.3 Nguyên tắc UI

- Tên hiển thị "Kho Tài Liệu Học Tập", `<html lang="vi">`; thuật ngữ thống nhất: Tải lên, Tải xuống, Công khai, Riêng tư, Tài liệu của tôi.
- Mọi khối dữ liệu có 4 trạng thái: đang tải / thành công / rỗng / lỗi (kèm "Thử lại").
- Form validate khi blur và khi gửi; lỗi server (`details`) gắn vào đúng trường; giới hạn kích thước dùng cùng hằng số 52 428 800 với backend.
- Một bảng màu xanh, sáng/tối theo `prefers-color-scheme` (CR-006); token trong `styles/tokens.css`; breakpoint 640/1024 px; vùng chạm ≥ 44 px.
- Accessibility: skip link, landmark, `aria-live` cho toast/tiến độ, dialog `<dialog>` + `showModal()` trả focus đúng chỗ, nhãn chế độ luôn có chữ (không chỉ dùng màu).

---

## 12. Môi trường local và cấu hình

### 12.1 Chạy nhanh

| Cách | Lệnh |
|---|---|
| Windows (có hoặc không có Docker) | `run.bat` → đợi "Đã chạy xong" → http://localhost:5173/register. Dừng: `run.bat stop`. Không có Docker thì script tải MySQL 8.4.7 + SeaweedFS 4.48 portable vào `%LOCALAPPDATA%\btl-cloud-services` |
| Docker | `docker compose up -d --wait` → `npm ci` → `cp backend/.env.example backend/.env` → `npm --prefix backend run prisma:deploy` → `npm --prefix backend run storage:init` → `npm --prefix backend run dev` và (terminal khác) `npm --prefix frontend run dev` |
| Production-like (cùng origin như ALB) | `npm run build`, đặt `SERVE_FRONTEND=true` cho process, `npm --prefix backend start` → http://localhost:3000 |

```mermaid
flowchart LR
  subgraph devbox["Máy dev Windows"]
    browser["Trình duyệt<br/>http://localhost:5173"]
    vite["Vite dev server :5173<br/>proxy /api"]
    be["Backend :3000<br/>tuỳ chọn instance thứ 2 :3001"]
    tmp[("backend/tmp/uploads")]
    subgraph svc["Docker Compose hoặc run.bat portable"]
      mysql[("MySQL 8.4 :3306<br/>btl_cloud, btl_cloud_test")]
      weed[("SeaweedFS S3 API :9000<br/>btl-cloud-documents")]
    end
  end
  browser --> vite
  vite -->|"/api/*"| be
  browser -.->|"production-like<br/>http://localhost:3000"| be
  be --> mysql
  be --> weed
  be --> tmp
```

| Dịch vụ | Địa chỉ |
|---|---|
| Frontend dev | http://localhost:5173 (proxy `/api` → `:3000`) |
| Backend / liveness / readiness | http://localhost:3000/api · `/api/health` · `/api/health/ready` |
| MySQL | `127.0.0.1:3306`, user `btl`, DB `btl_cloud` (dev) / `btl_cloud_test` (test) |
| S3-compatible storage (SeaweedFS) | http://localhost:9000 |

### 12.2 Biến môi trường backend

Khai báo và validate trong [config/env.ts](../backend/src/config/env.ts); mẫu dev ở [backend/.env.example](../backend/.env.example) (giá trị dev công khai; `.env` không commit). Frontend **không có biến môi trường**.

| Biến | Dev | AWS (dự kiến, chốt ở M5) |
|---|---|---|
| `NODE_ENV` / `PORT` | `development` / `3000` | `production` / `3000` |
| `DATABASE_URL` | `mysql://btl:btl_dev_password@localhost:3306/btl_cloud` | Endpoint RDS + TLS |
| `S3_BUCKET` / `S3_REGION` | `btl-cloud-documents` / `us-east-1` | Bucket thật / `us-east-1` |
| `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` | `http://localhost:9000` / `true` | *(trống)* / `false` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Khoá dev của storage local | **Không đặt** — SDK lấy từ IAM Role qua IMDSv2 |
| `ALLOWED_ORIGINS` | `http://localhost:5173,http://localhost:3000,http://localhost:3001` | Origin công khai |
| `SESSION_COOKIE_NAME` / `SESSION_TTL_HOURS` | `sid` / `168` | `__Host-sid` nếu HTTPS / `168` |
| `COOKIE_SECURE` / `HSTS_ENABLED` | `false` / `false` | `true` / `true` nếu HTTPS |
| `TRUST_PROXY` | `false` | `1` (sau ALB) |
| `UPLOAD_TMP_DIR` | `./tmp/uploads` | Thư mục trên EBS |
| `AUTH_RATE_LIMIT_MAX` | `20` | `20` |
| `LOG_LEVEL` | `debug` | `info` |
| `SERVE_FRONTEND` / `FRONTEND_DIST_DIR` | `false` / `../frontend/dist` | `true` / đường dẫn dist |
| `INSTANCE_ID` | *(trống → hostname)* | *(trống → hostname)* |

### 12.3 Khởi động và tắt

- **Khởi động** ([server.ts](../backend/src/server.ts)): load config (sai → `exit(1)`) → tạo thư mục tạm → kết nối DB (lỗi không chặn khởi động, liveness vẫn 200) → dọn toàn bộ `UPLOAD_TMP_DIR` → xoá phiên hết hạn theo lô 1000 → listen.
- **Timeout:** `requestTimeout` 900 s (upload 50 MiB qua mạng chậm); `keepAliveTimeout` 125 s / `headersTimeout` 126 s (lớn hơn ALB idle timeout 120 s để tránh 502).
- **Tắt (SIGTERM/SIGINT):** `server.close()` → chờ request đang chạy tối đa 30 s → disconnect DB, huỷ client storage → thoát.

---

## 13. Kiến trúc AWS mục tiêu (M5, chưa triển khai)

> Chỉ là thiết kế; **chưa provisioning gì**. Mọi khác biệt so với local nằm ở biến môi trường. Các quyết định HTTPS (OD-05), egress (OD-06), cách cấp mật khẩu RDS (OD-07), metric scaling (OD-09) sẽ chốt ở M5.

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

### 13.1 Ánh xạ local → AWS

| Local | AWS | Thay đổi cấu hình |
|---|---|---|
| MySQL 8.4 (container/portable) | RDS MySQL 8.4 `db.t3.micro` Single-AZ, không public, subnet group 2 private subnet | `DATABASE_URL`, TLS |
| SeaweedFS bucket | S3 bucket private + S3 Gateway Endpoint | `S3_ENDPOINT` trống, tắt path-style, bỏ access key → IAM Role |
| Backend `:3000` (và `:3001`) | EC2 `t3.micro` trong ASG min 2 / desired 2 / max 4 trên 2 private subnet, cùng artifact | `SERVE_FRONTEND=true`, `TRUST_PROXY=1` |
| Vite proxy `:5173` | ALB internet-facing → target group HTTP:3000, health check `/api/health` | SPA do backend phục vụ |
| `backend/tmp/uploads` | EBS gp3 20 GiB mã hoá | `UPLOAD_TMP_DIR` |
| Log console | CloudWatch Logs (nếu OD-06 cho phép) + metric có sẵn | CloudWatch Agent |
| `backend/.env` | Launch template user data / SSM Parameter Store (OD-07) | — |

### 13.2 Mạng, quyền, giám sát

| Security group | Inbound | Outbound |
|---|---|---|
| `sg-alb` | TCP 80 (và 443 nếu HTTPS) từ `0.0.0.0/0` | TCP 3000 tới `sg-app` |
| `sg-app` | TCP 3000 **chỉ** từ `sg-alb` | 3306 tới `sg-rds`; 443 tới prefix list S3 |
| `sg-rds` | TCP 3306 **chỉ** từ `sg-app` | — |

- **IAM Role cho EC2** (least privilege, bắt buộc IMDSv2): `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:AbortMultipartUpload` trên `arn:aws:s3:::<bucket>/documents/*`; `s3:ListBucket` trên bucket (cho readiness). Thêm tuỳ OD-06/07: CloudWatch Agent, SSM.
- **ALB:** health check `/api/health` (interval 15 s, healthy 2 / unhealthy 3), không sticky session, idle timeout 120 s, deregistration delay 60 s.
- **ASG:** launch template AL2023, health check type ELB (grace 300 s), target tracking theo OD-09, cập nhật bằng instance refresh.
- **CloudWatch alarm đề xuất:** (1) CPU trung bình ASG > 70 % trong 2 × 1 phút; (2) `UnHealthyHostCount ≥ 1` trong 2 phút — **kích hoạt thử** bằng cách dừng service trên một instance; (3) 5XX > 10 trong 5 phút; (4) RDS `FreeStorageSpace < 2 GiB`. Thông báo qua SNS email.

### 13.3 Ánh xạ 8 hạng mục bắt buộc của đề bài

| # | Hạng mục | Thành phần |
|---|---|---|
| 1 | Mạng riêng, subnet public/private trên ≥ 2 AZ | VPC, 2 public + 2 private subnet |
| 2 | Máy chủ ứng dụng trong private subnet | EC2 trong ASG ở private subnet, chỉ ALB vào được |
| 3 | ≥ 2 loại lưu trữ | S3 (object) + EBS (block) + RDS |
| 4 | Một cơ sở dữ liệu | RDS MySQL 8.4 |
| 5 | IAM Role, không nhúng access key | Instance profile + IMDSv2; repo không có access key |
| 6 | Cân bằng tải + tự mở rộng, demo khi tải tăng | ALB + ASG 2–4; kịch bản thử tải M5-08 |
| 7 | Giám sát, ≥ 1 alarm kích hoạt thử | CloudWatch alarm `UnHealthyHostCount` |
| 8 | Dự toán chi phí tháng | M5-09 (Pricing Calculator) |

### 13.4 Vấn đề AWS còn mở

| ID | Vấn đề | Phương án |
|---|---|---|
| U-01 | Egress cho EC2 private (cài runtime, gửi log, Session Manager) | Chỉ S3 Gateway Endpoint / thêm Interface Endpoint / NAT Gateway (có phí, chưa có trong dự toán gốc) |
| U-02 | HTTPS | Tên miền + ACM, hoặc chỉ HTTP và ghi nhận rủi ro cookie không mã hoá |
| U-03 | Mật khẩu RDS | SSM SecureString (cần endpoint/NAT) hoặc user data |
| U-04 | Sẵn sàng | RDS Single-AZ là điểm lỗi đơn — đã chấp nhận vì chi phí |
| U-05 | Metric scaling | CPU khó tăng vì app chủ yếu chờ I/O; cân nhắc `ALBRequestCountPerTarget` |
| U-06…U-08 | IPv4 công khai của ALB, burst credit t3, quota tài khoản | Rà soát ở M5-09 |

---

## 14. Kiểm thử, CI và tiến độ

### 14.1 Bộ kiểm thử

| Loại | Lệnh | Cần hạ tầng | Số test (lượt cuối 2026-10-23) |
|---|---|---|---|
| Backend unit | `npm --prefix backend test` | Không | 66 |
| Backend integration (Supertest qua toàn app, fault injection storage) | `npm --prefix backend run test:integration` | MySQL + storage; chỉ reset `btl_cloud_test` | 74 |
| Frontend unit (RTL, mock fetch/XHR) | `npm --prefix frontend test` | Không | 61 |
| E2E (Playwright, backend thật) | `npm --prefix frontend run test:e2e` | Stack production-like `:3000` | 9 (E2E-01…06 + contract flows) |
| UI suite (API mock; 8 route × 360/768/1280 px; axe, bàn phím) | `npm --prefix frontend run test:ui` | Không | 7 |
| Ma trận phân quyền Guest/A/B | `node scripts/verify/authz-matrix.mjs` | `:3000` | 82 kiểm tra |
| Ma trận upload/download (3 loại, 50 MiB/+1 byte, tệp giả/rỗng, tên UTF-8, SHA-256) | `node scripts/verify/upload-matrix.mjs` | `:3000` | 42 kiểm tra |

**CI** ([.github/workflows/ci.yml](../.github/workflows/ci.yml), job `ci-required`): chạy khi PR vào `main` và push lên `feature/**`, `fix/**`, `chore/**`; kiểm tra CODEOWNERS, conflict marker, rồi `npm ci` → `npm run lint` → `npm run build` → `npm test` ở root (unit BE + FE). Integration/E2E chạy local, chưa đưa vào CI (OD-08).

**Quy trình đóng góp:** nhánh `feature/*`, `fix/*`, `chore/*`; Conventional Commits; PR vào `main` cần `ci-required` đạt và code owner review.

### 14.2 Truy vết yêu cầu → kiểm chứng

| FR | API | Trang | Kiểm chứng tự động |
|---|---|---|---|
| FR-01 | API-03…06 | P-02, P-03 | E2E-01: đăng ký/đăng nhập/đăng xuất, cookie HttpOnly, không token trong localStorage |
| FR-02 | API-07, 09 | P-01, P-04 | E2E-02/03; integration search (phân trang, ký tự `%`, dấu tiếng Việt) |
| FR-03 | API-03, 13 | P-01, P-04, P-05 | E2E-02/03: Guest 401, Private người khác 404, tên UTF-8, SHA-256 |
| FR-04 | API-10 | P-06 | E2E-01/06 + upload matrix |
| FR-05 | API-10 | P-06 | E2E-01/04/06 |
| FR-06 | API-08 | P-05 | E2E-01/03: kho riêng, cách ly A/B |
| FR-07 | API-11 | P-07 | E2E-04 |
| FR-08 | API-12 | P-07 | E2E-04/06; integration fault injection 503 giữ tệp cũ |
| FR-09 | API-14 | P-04, P-05, P-07 | E2E-05; integration xoá khi storage lỗi vẫn 204 + log |

### 14.3 Tiến độ và việc còn mở

| Mục | Trạng thái |
|---|---|
| M4-12, M4-G | [OWNER] diễn tập demo local và gate M4 — chưa làm |
| M4-07, M4-08 | Hoãn (CR-005): lỗi storage thật khi dừng dịch vụ; demo 2 instance `:3000`/`:3001` |
| M5-01…M5-10, M5-G | Chưa làm: rà soát stateless, kế hoạch EC2/RDS/S3/ALB/ASG/IAM/CloudWatch, thử tải, chi phí, runbook; owner quyết định có provisioning |
| SEC-002 (MAJOR, OPEN) | Advisory HIGH ở chuỗi Prisma CLI → deepmerge-ts; cần kế hoạch nâng Prisma major 7 |
| Hạn chế đã biết | Object mồ côi sau lỗi/crash; replace đồng thời last-write-wins; rate limit theo instance; nếu phiên hết hạn đúng giữa lúc kiểm API-03 và lúc tải, trình duyệt hiện JSON lỗi; collation có thể không coi "đ" ≡ "d" |

**Nhật ký thay đổi baseline đã duyệt:** CR-001 SeaweedFS thay MinIO · CR-002 Prisma generate, `storage:init`, npm `allowScripts` · CR-003 chỉ reset DB test · CR-004 `run.bat` · CR-005 hoãn M4-07/08 · CR-006 một bảng màu sáng/tối · CR-007 DB ↔ storage best-effort, bỏ guard/worker/optimistic concurrency · CR-008 rút gọn tài liệu.

**Mốc học phần (cần xác nhận):** nộp báo cáo, mã nguồn, video ~09/11/2026; bảo vệ ~16/11/2026.

---

## 15. Đồng bộ tài liệu gốc với mã nguồn

CONTEXT, ARCHITECTURE và MILESTONES được viết trước một số CR. Các điểm dưới đây đã được sửa trong tài liệu gốc để khớp mã nguồn; phần bằng chứng lịch sử trong MILESTONES giữ nguyên.

| Trước đây ghi | Nay ghi (khớp mã nguồn) | Nguồn |
|---|---|---|
| Local storage là MinIO (`minio`, `minio-init`, console `:9001`) | SeaweedFS 4.48, S3 API ở `:9000`, không console; bucket tạo bằng `npm --prefix backend run storage:init`; ACC-09…11 dùng `docker compose stop/start seaweedfs` và S3 client để liệt kê object | CR-001, `docker-compose.yml`, `backend/scripts/init-storage.ts` |
| FR-08: hai lần thay đồng thời → 409; xoá object cũ sau ân hạn 120 s (OD-11) | Last write wins, không 409; thử xoá object cũ ngay sau UPDATE | CR-007, `documents.service.ts` |
| BR-08, FR-09, NFR-REL-03, NFR-CON-01/02, RK-01: worker tự thử lại, bảng `storage_cleanup_tasks` | Xoá best-effort một lần, lỗi ghi WARN `storage.orphan`; không worker, không bảng cleanup | CR-007 |
| API-14 liệt kê lỗi 409 | 401, 403, 404 | CR-007 |
| Header `OWNER_APPROVAL: PENDING` | `APPROVED` (MILESTONES `OWNER_APPROVED_M0: YES`) | MILESTONES |
| Chỉ chạy local bằng Docker; ACC-04 chỉ có lệnh `docker compose exec` | Docker hoặc `run.bat` portable; ACC-04 có thêm lệnh `mysql.exe` cho `run.bat` | CR-004, `run.bat` |
| Cây thư mục ARCHITECTURE §A1.3 thiếu `run.bat`, `scripts/verify/`, `backend/scripts/`, `container.ts`, `lifecycle.ts`, `frontend/ui-tests/` | Đã bổ sung | Repo |
| Sự kiện log `cleanup.*` (M2-14) | `storage.orphan`, `download.object_missing`, `sessions.startup_cleanup_failed`, `server.*` | Mã nguồn backend |

---

## Thuật ngữ

| Thuật ngữ | Nghĩa |
|---|---|
| Guest / User / Owner | Chưa đăng nhập / đã đăng nhập / User đã tải lên tài liệu đang xét |
| Metadata | Tiêu đề, mô tả, chế độ, tên tệp, kích thước, loại… (MySQL) |
| Object | Byte của tệp trong object storage |
| Liveness / Readiness | `/api/health` (process còn sống) / `/api/health/ready` (DB + storage sẵn sàng) |
| Object mồ côi | Object không còn bản ghi `documents` nào trỏ tới, do lỗi giữa DB và storage |
| ID tham chiếu | `FR`, `BR`, `AC`, `NFR`, `OD`, `RK`: CONTEXT · `D`, `UC`, `API`, `P`, `SEQ`, `INV`, `U`: ARCHITECTURE · `M<n>-xx`, `CR`, `ACC`: MILESTONES |
