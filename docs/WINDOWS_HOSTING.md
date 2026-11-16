# Vận hành trên Windows

Hướng dẫn cho người giữ máy chủ. Người chỉ sử dụng website xem [README](../README.md); cấu hình kỹ thuật và AWS xem [ARCHITECTURE](ARCHITECTURE.md).

## Khởi động và dừng

Cài Node.js 24 và mở thư mục dự án. Lần đầu launcher tự cài dependency, tải MySQL 8.4.7/SeaweedFS 4.48, tạo cấu hình local, deploy migration và tạo bucket. Cần Internet; không cần Docker.

| Thao tác | File/lệnh |
|---|---|
| Bật chia sẻ và copy link | `server.bat` |
| Mở quản trị | `admin.bat` |
| Dừng toàn bộ server, admin và link chia sẻ | `stop server.bat` |
| Dừng admin; giữ server nếu đang chạy | `stop admin.bat` |
| Mở web local / dừng mọi dịch vụ | Start.vbs / Stop.vbs |
| Xem chế độ, PID và link | `server.bat status` hoặc `admin.bat status` |

Hai chế độ dùng chung controller/backend/DB/storage. Mỗi lần khởi động mới bằng `server.bat`, `admin.bat` hoặc Start.vbs, launcher build cả backend và frontend rồi áp migration trước khi bật ứng dụng. Build lỗi sẽ báo thất bại, không bật backend hoặc tạo link chia sẻ từ bản cũ. Bật thêm chế độ không build lặp hay restart; click server lặp chỉ copy lại link. `stop server.bat` luôn dừng toàn bộ, kể cả admin. `stop admin.bat` giữ server và link chia sẻ nếu server đang chạy; nếu chỉ có admin thì dừng toàn bộ. Nếu stack đã bật bằng Start.vbs, server giữ phiên đó như admin.

Quick Tunnel trỏ gateway 127.0.0.1:3002, phục vụ frontend build và chuyển `/api` về backend hiện có. Gateway không phục vụ `/admin`, `/__local`, `/api/dev`. Vite/controller/DB/storage chỉ nghe loopback; không mở port forwarding các cổng nội bộ. Worker chỉ dừng cloudflared do nó tạo và tự thoát khi controller kết thúc.

PC cần bật, có mạng và không sleep. Link đổi sau khi dừng/bật lại server. Cloudflared được cài qua winget nếu thiếu. Log tunnel: `backend/tmp/tunnel.log`; log dịch vụ: `backend/tmp/local-services.ndjson`.

## Thiết lập quản trị

Mọi file `.bat` và các thư mục admin được Git bỏ qua. Bản clone không có mã admin vẫn chạy website bình thường bằng Start.vbs / Stop.vbs. Cấp tài khoản developer lần đầu sau khi cài dependency:

```powershell
npm --prefix backend run dev:account -- ten_cua_ban
```

Mật khẩu ngẫu nhiên chỉ in một lần. Mở http://localhost:5173/admin, chọn **Đăng nhập nhà phát triển**. Đây là tài khoản công cụ local; không cấp quyền quản trị bằng tài khoản website.

Chỉ khi cần cấp lại mật khẩu và thu hồi phiên cũ:

```powershell
npm --prefix backend run dev:account -- ten_cua_ban --reset
```

## Dữ liệu và sao lưu

- MySQL và SeaweedFS portable: `%LOCALAPPDATA%\btl-cloud-services`.
- Cấu hình ứng dụng: `backend/.env`.
- Tài khoản developer, trạng thái tiến trình và log: `backend/tmp/`.
- Mã admin chỉ có trên máy owner: `backend/admin/`, `frontend/src/admin/`, `frontend/admin-tests/` và hai file batch admin.

Để sao lưu, dừng dịch vụ rồi dùng mysqldump hoặc bản sao nhất quán của dữ liệu MySQL, sao lưu SeaweedFS cùng `.env` và các thành phần admin. Giữ bản sao ngoài thư mục repo. Không xoá thư mục dữ liệu để xử lý lỗi khởi động.

## Cập nhật mã nguồn

1. Dừng toàn bộ bằng `stop server.bat` hoặc Stop.vbs và chờ controller thoát.
2. Sao lưu dữ liệu và cập nhật mã nguồn.
3. Nếu dependency thay đổi, chạy `npm ci` từ gốc dự án.
4. Bật lại chế độ cần dùng. Launcher tự build backend/frontend và deploy migration, không reset DB.
5. Kiểm `/api/health/ready`, đăng nhập và tải thử trước khi gửi link mới.

Sau khi cập nhật mã, cần dừng toàn bộ rồi bật lại để nhận bản mới. Bật thêm admin/server trong phiên đang chạy sẽ kế thừa phiên đó. Không cần build thủ công; người sửa mã có thể chạy `npm run lint` và `npm test` để kiểm tra thay đổi trước khi khởi động.

## Docker tuỳ chọn

Compose phục vụ MySQL và SeaweedFS khi cần môi trường đồng nhất, đặc biệt trên Linux/macOS hoặc integration test. Các file trong `docker/` còn được portable dùng để bootstrap; không xoá riêng thư mục này.

Trên Windows, controller mặc định portable. Nếu chủ động chọn Docker, dừng stack trước rồi đặt `$env:BTL_LOCAL_MODE='docker'` và chạy launcher trong cùng cửa sổ. Hai chế độ lưu dữ liệu ở vị trí khác nhau; không chuyển qua lại như một cách sửa lỗi dữ liệu.

Chạy thủ công với Compose, từ gốc repo:

```sh
docker compose up -d --wait
npm ci
# Tạo backend/.env từ backend/.env.example nếu chưa có, không ghi đè cấu hình hiện tại.
npm --prefix backend run prisma:deploy
npm --prefix backend run storage:init
npm --prefix backend run dev
# Terminal khác:
npm --prefix frontend run dev
```

Khi xong: dừng hai app bằng Ctrl+C, rồi `docker compose stop`. Giữ volumes để giữ dữ liệu. Không dùng `down -v` cho dữ liệu cần giữ.
