# Host website trên PC Windows, quản trị chỉ tại máy chủ

PC giữ Express, MySQL và SeaweedFS; người dùng chỉ cần trình duyệt và URL HTTPS.
Express phục vụ `frontend/dist` và `/api` cùng origin. Không dùng Vite làm website public.
Không cần AWS hoặc Docker; không thay tài khoản web, quyền tài liệu hay tài khoản developer hiện tại.

## 1. Chuẩn bị bản build

Dùng Node.js 24 và dependency đã cài. Tại gốc repo, tắt kết nối public (nếu có), rồi dừng stack bằng `Stop.vbs` hoặc:

```powershell
.\run.bat stop
npm run build
```

Chỉ tiếp tục khi build thành công và có `backend/dist/server.js`, `frontend/dist/index.html`.
Không chạy reset/seed DB. Sao lưu DB và thư mục dữ liệu SeaweedFS trước khi triển khai/cập nhật.
Launcher giữ nguyên bước bootstrap/migration deploy hiện có, không xoá dữ liệu.

## 2. Bật stack phục vụ bản production

Trong PowerShell tại gốc repo (thay hostname mẫu bằng hostname HTTPS của bạn):

```powershell
$env:NODE_ENV = 'development' # Controller/Vite local; chỉ Express con chạy production.
$env:BTL_LOCAL_PRODUCTION = '1'
$env:BTL_LOCAL_MODE = 'portable'
$env:ALLOWED_ORIGINS = 'https://tailieu.example.com,http://localhost:5173'
$env:COOKIE_SECURE = 'true'
$env:HSTS_ENABLED = 'true'
$env:TRUST_PROXY = 'loopback'
$env:LOG_LEVEL = 'info'
.\run.bat start
```

Controller đọc cấu hình khi khởi động. Phải dừng controller cũ trước khi đổi chế độ/cấu hình.
Không đặt `NODE_ENV=production` cho controller. Biến `BTL_LOCAL_PRODUCTION=1` chỉ chọn
Express đã build với `NODE_ENV=production`, `SERVE_FRONTEND=true`, bind `127.0.0.1:3000`;
không chạy TypeScript/tsx cho Express này. Các tiến trình vẫn do controller hiện tại quản lý.

Kiểm tra tại máy chủ:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health/ready
Get-NetTCPConnection -State Listen |
  Where-Object { $_.LocalPort -in 3000,3001,3306,5173,9000,9333,8080,8888 } |
  Select-Object LocalAddress,LocalPort
```

Readiness phải báo database/storage `ok`. Các cổng trên chỉ được nghe loopback
(`127.0.0.1`/`::1`). Bản Docker tuỳ chọn cũng chỉ publish MySQL/S3 ra `127.0.0.1`;
container đang tồn tại cần được tạo lại có kế hoạch để áp mapping mới, giữ nguyên volumes.

Mở **http://localhost:5173/admin** (chỉ máy owner có thư mục admin), chọn **Đăng nhập nhà phát triển**, dùng tài khoản developer
đã có. Backend ON/OFF, Khởi động lại, Start All, Stop All, Services và log chỉ mở sau
xác thực developer. Tài khoản web thông thường không cấp quyền này. Backend ON/OFF
điều khiển chính Express production; Vite vẫn ở localhost để quản trị khi Express tắt.
Stop All dừng các dịch vụ và controller; lần sau chạy lại lệnh trên.

`Start.vbs`, `Stop.vbs`, `run.bat` được giữ nguyên. `Start.vbs` nhận biến môi trường từ
process gọi nó; nhấp đúp từ Explorer không nhận các biến vừa đặt trong PowerShell.
Muốn dùng Start.vbs trong chế độ host, gọi `cscript.exe //nologo .\Start.vbs` từ cửa sổ
đã đặt các biến trên. Khi dùng mặc định, Start.vbs vẫn chạy workflow dev hiện tại.
Không cấp lại/reset developer account hiện có.

## 3. Cho người dùng truy cập HTTPS

Một lựa chọn là cài `cloudflared` trên chính PC, tự cấu hình named Cloudflare Tunnel
và hostname/domain theo [hướng dẫn chính thức](https://developers.cloudflare.com/tunnel/get-started/).
Chỉ publish **một** website tới `http://127.0.0.1:3000`; giữ Host/Origin public và bật HTTPS
ở phía ngoài. Không tạo route tới controller `3001`, Vite `5173`, MySQL `3306`, S3 `9000`
hay các cổng nội bộ SeaweedFS. Không bật port forwarding trên router cho các cổng đó.

Ví dụ phần ingress của cấu hình tunnel do bạn tự tạo (credentials để ngoài repo):

```yaml
ingress:
  - hostname: tailieu.example.com
    path: ^/(__local|api/dev)(/.*)?$
    service: http_status:404
  - hostname: tailieu.example.com
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Xem [cấu trúc config và kiểm tra ingress](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/configuration-file/).
Không rewrite đường dẫn public sang localhost developer. Nếu dùng reverse proxy khác,
proxy cũng chỉ trỏ Express, chặn `/__local` và `/api/dev`, thay header forwarding do client
tự gửi bằng header của proxy; chỉ tin proxy loopback. Đặt giới hạn request tối thiểu
**50 MiB cộng multipart overhead** và timeout đủ cho upload/download. Không cache `/api/*`.

Người dùng mở **https://tailieu.example.com**, đăng ký/đăng nhập bình thường, không clone
repo hoặc nhận tài khoản developer. Cookie web Secure dùng qua HTTPS. PC cần luôn bật,
không sleep, có Internet; mất mạng hoặc Stop All sẽ làm website offline.

## 4. Trước khi chia sẻ URL và khi cập nhật

- Kiểm tra firewall Windows chặn truy cập từ xa tới các cổng nội bộ; chỉ connector/proxy
  được truy cập Express qua loopback. Không phục vụ thư mục repo, `.env`, `backend/tmp`,
  file account/capability, log, thư mục MySQL hoặc SeaweedFS bằng proxy/file server.
- Thay các mật khẩu DB/S3 mẫu trước khi public, đồng bộ cấu hình dịch vụ và `.env`, giữ
  quyền file Windows chỉ cho người quản trị. Không xoá account hoặc dữ liệu để đổi mật khẩu.
- Từ thiết bị khác, kiểm tra HTTPS, đăng nhập, tải lên/xuống tài liệu thử bằng tài khoản
  được phép; tài liệu riêng vẫn chỉ chủ sở hữu xem. Không có nút developer và các URL
  `/__local/backend/status`, `/__local/backend/start-all`, `/api/dev/services` trả 404.
  Kiểm tra các cổng nội bộ không kết nối được từ LAN/Internet.
- Khi cập nhật: dừng tunnel/proxy public, Stop.vbs, build lại, chạy lại cấu hình ở bước 2,
  kiểm tra readiness rồi mới bật lại tunnel. Build không tự cập nhật process đang chạy.
- Trở về dev: Stop.vbs, mở PowerShell mới không đặt các biến host, chạy Start.vbs.

Tài liệu này không tự cài tunnel, đăng ký domain, mở firewall/cổng hoặc tạo tài nguyên.
HTTPS/domain, kiểm tra từ máy khác và tự khởi động sau reboot cần người quản trị cấu hình.
Nếu dùng Task Scheduler, chạy launcher bằng tài khoản Windows quản lý dữ liệu, với cùng
thư mục làm việc và biến môi trường; không chạy đồng thời hai controller.
