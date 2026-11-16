# Thử tải local

Dùng DB `btl_cloud_load` và bucket `btl-cloud-documents-load` riêng. Seed từ chối DB/bucket khác và endpoint ngoài loopback. MySQL/SeaweedFS phải đang chạy; build backend trước khi đo.

## Chuẩn bị trên PowerShell

Từ gốc dự án:

```powershell
$env:DATABASE_URL='mysql://btl:btl_dev_password@localhost:3306/btl_cloud_load'
$env:S3_BUCKET='btl-cloud-documents-load'
npm --prefix backend run prisma:deploy
node --env-file=backend/.env scripts/load/seed.mjs
```

Seed tạo 50 tài khoản, 500 tài liệu; chạy lại bằng upsert. Mật khẩu test: `matkhau123`. Tài liệu `00000000-0000-4000-9000-000000000001` có tệp 1 MiB để đo tải xuống.

Chạy backend riêng trên cổng 3100 trong cùng cửa sổ:

```powershell
$env:NODE_ENV='production'
$env:PORT='3100'
$env:SERVE_FRONTEND='false'
$env:AUTH_RATE_LIMIT_MAX='1000000'
node --env-file=backend/.env backend/dist/server.js
```

## Đo

Trong cửa sổ khác, dùng `npx autocannon -c 10 -d 60 <URL>`. Đo lần lượt 1, 10 và 50 kết nối cho:

| Kịch bản | Request |
|---|---|
| Tìm kiếm | GET `http://localhost:3100/api/documents?q=giai` |
| Tải 1 MiB | GET `/api/documents/00000000-0000-4000-9000-000000000001/download`, kèm session cookie |
| Đăng nhập | POST `/api/auth/login`, JSON email/password, header `X-CSRF-Protection: 1` |

Đăng nhập bằng `load-user-01@example.com` để lấy cookie trước khi đo tải xuống. Ghi phiên bản mã, máy đo, số kết nối, thời lượng, req/s, độ trễ và số lỗi cùng nhau. Số đo local không đại diện hiệu năng AWS.

Dừng backend bằng Ctrl+C rồi đóng cửa sổ để bỏ các biến môi trường thử tải. Tài liệu vận hành: [WINDOWS_HOSTING](../../docs/WINDOWS_HOSTING.md).
