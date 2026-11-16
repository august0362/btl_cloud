# Vận hành trên Windows

Dành cho người giữ máy chủ. Người sử dụng website xem [README](../README.md).

## Khởi động và dừng

Cài Node.js 24. Lần đầu launcher tự cài dependency, tải MySQL/SeaweedFS portable, tạo cấu hình local, build backend/frontend, deploy migration và tạo bucket. Cần Internet; không cần Docker.

| Thao tác | File/lệnh |
|---|---|
| Chạy web local / dừng toàn bộ | Start.vbs / Stop.vbs |
| Bật chia sẻ HTTPS và copy link | `server.bat` |
| Mở quản trị | `admin.bat` |
| Dừng server, admin và link | `stop server.bat` |
| Dừng admin, giữ server nếu đang chạy | `stop admin.bat` |
| Xem PID, dịch vụ và link | `server.bat status` hoặc `admin.bat status` |

Mỗi phiên khởi động mới đều build cả hai ứng dụng trước khi chạy. Build lỗi sẽ báo thất bại. Bật thêm admin/server kế thừa PID hiện tại; không build lặp hay restart. Khi chỉ có admin, dừng admin cũng dừng toàn bộ. Dữ liệu được giữ giữa các phiên.

Các file `.bat` và thư mục admin là tiện ích riêng của máy owner, được Git bỏ qua. Clone thiếu admin vẫn chạy web bằng Start.vbs. Link chia sẻ đổi sau khi dừng/bật lại; máy chủ cần bật, có mạng và không sleep. Cloudflared được cài qua winget nếu thiếu.

## Tài khoản quản trị

Tài khoản developer riêng với tài khoản website. Sau khi dependency đã được cài, cấp tài khoản rồi mở http://localhost:5173/admin:

```powershell
npm --prefix backend run dev:account -- ten_cua_ban
```

Mật khẩu ngẫu nhiên chỉ in một lần. Cấp lại mật khẩu và thu hồi phiên cũ bằng cách thêm `--reset`.

## Dữ liệu và cập nhật

| Vị trí | Nội dung |
|---|---|
| `%LOCALAPPDATA%\btl-cloud-services` | MySQL và SeaweedFS portable |
| `backend/.env` | Cấu hình ứng dụng |
| `backend/tmp/developer-account.json` | Tài khoản developer |
| `backend/admin/`, `frontend/src/admin/`, `frontend/admin-tests/` | Mã và test admin riêng |
| `backend/tmp/local-services.ndjson`, `backend/tmp/tunnel.log` | Log dịch vụ và tunnel |

Sao lưu MySQL nhất quán cùng SeaweedFS, `.env` và mã/tài khoản admin ra ngoài repo. Không xoá thư mục dữ liệu để sửa lỗi khởi động.

1. Dừng toàn bộ bằng `stop server.bat` hoặc Stop.vbs, chờ controller thoát.
2. Sao lưu rồi cập nhật mã nguồn.
3. Nếu dependency/lockfile đổi, chạy `npm ci` từ gốc dự án.
4. Bật lại; launcher tự build và deploy migration. Kiểm `/api/health/ready` và đăng nhập/tải thử trước khi gửi link.

## Bảo trì dữ liệu cũ

Chỉ cần cho tài liệu có từ trước khi triển khai so trùng. Khi MySQL/SeaweedFS local đang chạy, từ `backend/`:

```sh
npx tsx --env-file=.env scripts/backfill-fingerprints.ts
npx tsx --env-file=.env scripts/cleanup-private-duplicates.ts
```

Lệnh dọn chỉ lập kế hoạch xoá **Private trùng SHA-256 với Public**. Xem file kế hoạch rồi áp dụng bằng `--apply --plan=tmp/<file-ke-hoach>.json`. Công cụ kiểm lại bytes/quyền/phiên bản trước khi xoá; các object xoá lỗi được trả trong `storageDeleteFailed`. Không tự xoá tài liệu chỉ vì giống chữ. Chi tiết tại [script](../backend/scripts/cleanup-private-duplicates.ts).

## Docker tuỳ chọn

Compose cung cấp MySQL/SeaweedFS, hữu ích trên Linux/macOS và cho integration. Portable cũng dùng cấu hình trong `docker/` để bootstrap, nên thư mục này là thành phần cần thiết.

Trên Windows, có thể dừng stack rồi đặt `$env:BTL_LOCAL_MODE='docker'` trước khi chạy launcher trong cùng cửa sổ. Portable và Docker lưu dữ liệu ở vị trí khác nhau.

Chạy thủ công với Compose: `docker compose up -d --wait`, `npm ci`, tạo `backend/.env` từ mẫu nếu chưa có, rồi chạy:

```sh
npm --prefix backend run prisma:deploy
npm --prefix backend run storage:init
npm --prefix backend run dev
# Terminal khác
npm --prefix frontend run dev
```

Dừng hai app bằng Ctrl+C, rồi `docker compose stop` để giữ volumes. Cấu hình cổng/bảo mật nằm trong [ARCHITECTURE](ARCHITECTURE.md).
