# Thử tải (E3-03, XM-12)

Chạy trên DB `btl_cloud_load` và bucket `btl-cloud-documents-load` riêng, không đụng dữ liệu dev (`btl_cloud`). Cách đọc kết quả và điều kiện để thêm cache: [ARCHITECTURE §A12.6](../../docs/ARCHITECTURE.md#a126-giám-sát-hiệu-năng-thử-tải-cache). Số đo local không dùng để suy ra hiệu năng trên AWS.

## 1. Chuẩn bị (một lần, MySQL + SeaweedFS local đang chạy)

```bash
# Tạo DB thử tải bằng migrate deploy. KHÔNG trỏ DATABASE_URL vào btl_cloud.
cd backend
DATABASE_URL="mysql://btl:btl_dev_password@localhost:3306/btl_cloud_load" npx prisma migrate deploy
cd ..

# Seed 50 user (mật khẩu matkhau123) + 500 tài liệu; tài liệu 00000000-0000-4000-9000-000000000001 là tệp 1 MiB.
# Chạy lại được; từ chối nếu DB không phải btl_cloud_load, bucket khác hoặc không phải loopback.
DATABASE_URL="mysql://btl:btl_dev_password@localhost:3306/btl_cloud_load" S3_BUCKET=btl-cloud-documents-load \
  node --env-file=backend/.env scripts/load/seed.mjs
```

## 2. Backend production-like (cổng 3100, không đụng stack dev ở 3000)

```bash
cd backend && npx tsc -p tsconfig.build.json
NODE_ENV=production PORT=3100 DATABASE_URL="mysql://btl:btl_dev_password@localhost:3306/btl_cloud_load" \
  S3_BUCKET=btl-cloud-documents-load LOG_LEVEL=warn AUTH_RATE_LIMIT_MAX=1000000 SERVE_FRONTEND=false \
  CLEANUP_WORKER_ENABLED=false INSTANCE_ID=load-test node --env-file=.env dist/server.js
```

`AUTH_RATE_LIMIT_MAX` chỉ nâng trong lần chạy này để kịch bản đăng nhập không bị 429.

## 3. Ba kịch bản (mỗi kịch bản chạy `-c 1`, `-c 10`, `-c 50`)

```bash
# Tìm kiếm (thường nghẽn ở MySQL)
npx autocannon -c 10 -d 60 "http://localhost:3100/api/documents?q=giai"

# Tải xuống 1 MiB (thường nghẽn ở SeaweedFS/đĩa). Lấy cookie trước:
curl -s -i -X POST http://localhost:3100/api/auth/login -H "Content-Type: application/json" -H "X-CSRF-Protection: 1" \
  -d '{"email":"load-user-01@example.com","password":"matkhau123"}' | grep -i set-cookie
npx autocannon -c 10 -d 60 -H "Cookie: sid=<giá trị>" "http://localhost:3100/api/documents/00000000-0000-4000-9000-000000000001/download"

# Đăng nhập (thường nghẽn ở CPU vì argon2id)
npx autocannon -c 10 -d 60 -m POST -H "Content-Type: application/json" -H "X-CSRF-Protection: 1" \
  -b '{"email":"load-user-02@example.com","password":"matkhau123"}' "http://localhost:3100/api/auth/login"
```

autocannon không in P95; báo cáo dùng P50 và P97.5. Nếu muốn so với dashboard, chạy kịch bản vào stack dev (cổng 3000) và xem `/admin`.

## 4. Kết quả mẫu (30/10/2026, máy 16 luồng, mỗi bậc rút còn 20 s, có ghi audit E7)

| Kịch bản | Kết nối | req/s | P50 / P97.5 (ms) | Lỗi | CPU backend (% máy) |
|---|---|---|---|---|---|
| Tìm kiếm | 1 / 10 / 50 | 63 / 341 / 368 | 13/20 · 26/36 · 132/173 | 0 | 2 / 8 / 8 |
| Tải xuống 1 MiB | 1 / 10 / 50 | 29 / 105 / 117 | 32/60 · 91/141 · 400/596 | 0 | 5 / 12 / 9 |
| Đăng nhập | 1 / 10 / 50 | 16 / 80 / 79 | 60/76 · 125/143 · 629/666 | 0 | 5 / 28 / 28 |

- **Tìm kiếm:** req/s chững ở ~370 từ 10 lên 50 kết nối, CPU backend chỉ ~8% → nghẽn ở MySQL (`LIKE` quét bảng), không phải Node.
- **Tải xuống:** ~117 MiB/s, CPU thấp → nghẽn ở SeaweedFS/đĩa.
- **Đăng nhập:** chững ở ~80 req/s, CPU ~28% máy (≈ 4,5 luồng = 4 luồng libuv chạy argon2id + luồng chính) → nghẽn CPU vì argon2id, đúng thiết kế.
- **Cache:** không cần. Chưa có mục tiêu thời gian phản hồi do owner đặt (điều kiện 1 chưa thoả), chưa thử index/sửa truy vấn (điều kiện 2), nên chưa đủ cả ba điều kiện §A12.6.
- **Có audit:** mỗi lần đăng nhập/tải xuống ghi một dòng `audit_events` (lần chạy này: 3 571 `AUTH_LOGIN`, 5 074 `DOCUMENT_DOWNLOAD`).
- **Chênh lệch bật/tắt phần đo (E3-AC-04):** chưa đo. Phần đo XM-05 luôn bật trong `app.ts`/`server.ts` (`BTL_LOCAL_METRICS_FILE` chỉ bật ghi snapshot), muốn tắt phải sửa `backend/src`, nên chờ owner quyết định.
