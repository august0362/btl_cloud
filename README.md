# BTL Cloud — Kho tài liệu học tập

Lưu trữ và chia sẻ PDF, DOCX, PPTX (tối đa 50 MiB), với tài khoản, kho cá nhân, tìm kiếm và chế độ Công khai/Riêng tư. Hiện là **local prototype**; M4-07/08 hoãn (CR-005), M5 (AWS) chưa làm.
Tiến độ: [MILESTONES](docs/MILESTONES.md). Tổng quan kiến trúc, đặc tả và sơ đồ: [PROJECT_OVERVIEW](docs/PROJECT_OVERVIEW.md).
Bàn giao cho thành viên nhóm theo hai PDF: [TEAM_HANDOFF](docs/TEAM_HANDOFF.md).

## Yêu cầu và chạy nhanh

Cài **Node.js 24** (kèm npm); dùng Docker Desktop hoặc Windows với `run.bat` khi không có Docker. Clone repo vào thư mục mới, mở terminal tại gốc repo.

**Windows:** nhấp **Start.vbs** để chạy ẩn, hoặc dùng `run.bat start` trong terminal. Lần đầu launcher tải MySQL 8.4.7 và SeaweedFS 4.48 vào `%LOCALAPPDATA%\btl-cloud-services`, cài dependency, tạo `.env`, áp migration, tạo bucket và mở web. Khi web sẵn sàng, vào http://localhost:5173/register để tạo tài khoản; đăng xuất rồi đăng nhập tại `/login`. Dừng toàn bộ bằng **Stop.vbs**, nút **Stop All** có xác nhận, hoặc `run.bat stop`. Dữ liệu portable được giữ giữa các lần chạy.

**Docker** (hai terminal cho ứng dụng):

```sh
docker compose up -d --wait
npm ci
cp backend/.env.example backend/.env
npm --prefix backend run prisma:deploy
npm --prefix backend run storage:init
npm --prefix backend run dev
# Terminal thứ hai, tại gốc repo:
npm --prefix frontend run dev
```

Trong PowerShell, có thể dùng `Copy-Item` thay `cp`. Vào `/register` tạo tài khoản; không có tài khoản demo mặc định. Không commit `.env`.

| Dịch vụ | URL/cổng |
|---|---|
| Frontend dev | http://localhost:5173 (proxy /api → backend) |
| Backend / health / readiness | http://localhost:3000/api/health · /api/health/ready |
| MySQL / S3-compatible storage | 127.0.0.1:3306 / http://localhost:9000 |

Production-like: `npm run build`, đặt biến **của process** `SERVE_FRONTEND=true`, chạy `npm --prefix backend start`; SPA và API cùng http://localhost:3000. PowerShell: `$env:SERVE_FRONTEND='true'`; cmd: `set SERVE_FRONTEND=true`.

## Launcher Windows và Development Tools

**Thành viên mới cần tài khoản developer:** sau khi clone, mở terminal ở gốc repo, chạy `npm ci`, rồi `npm --prefix backend run dev:account -- ten_cua_ban`. Lưu mật khẩu được in ra, mở Start.vbs và chọn **Đăng nhập nhà phát triển** trên web. Chỉ cấp một lần mỗi bản sao; những lần sau dùng lại tài khoản. Hướng dẫn chi tiết và lệnh cấp lại nằm bên dưới.

Chạy **Start.vbs** để mở toàn bộ stack mà không hiện CMD/PowerShell; chỉ mở trình duyệt một lần trong mỗi phiên controller. Nhấn Start nhiều lần không tạo tiến trình hoặc tab trùng. **Stop.vbs** dừng toàn bộ. Trong terminal dùng `run.bat` / `run.bat start`, `run.bat stop`; `run.bat restart` dừng rồi bật lại. Nếu Start đang chạy, Stop/Restart chờ lượt để thực hiện; `run.bat status` vẫn đọc được trạng thái và log đã lọc bí mật. Không dùng launcher trên AWS/production.

Controller Node duy nhất tại **127.0.0.1:3001** khởi động MySQL/SeaweedFS → Express :3000 → Vite :5173, thu stdout/stderr và giữ các handle/PID nó tạo. Dịch vụ chạy ẩn; cấu hình `.env`, thư mục MySQL, SeaweedFS và tài liệu đã có được giữ. Lần đầu vẫn dùng MySQL 8.4.7 / SeaweedFS 4.48 portable, `npm ci`, migration deploy và tạo bucket như launcher cũ; không reset DB. Biến `DEBUG` được bỏ riêng trong môi trường con của dịch vụ để tránh lỗi SeaweedFS. Backend không có watcher: dùng **Khởi động lại** sau khi sửa mã backend.

Tại **http://localhost:5173**, mở **Đăng nhập nhà phát triển** và dùng tài khoản được cấp để truy cập toàn bộ công cụ local (Backend, Start/Stop All, Services và Developer Mode). Controller kiểm tra phiên cho cả đọc trạng thái/log lẫn thao tác điều khiển; sửa `localStorage` hoặc đăng nhập tài khoản người dùng thông thường không cấp quyền developer. Phiên dùng cookie HttpOnly, SameSite=Strict, hết hạn sau 8 giờ; đăng xuất hoặc khởi động lại controller yêu cầu đăng nhập lại. Đăng nhập developer vẫn hoạt động khi Express/MySQL đang tắt.

Người quản lý cấp **một tài khoản developer cục bộ cho mỗi bản sao dự án** bằng lệnh tại gốc repo:

```sh
npm --prefix backend run dev:account
# Tuỳ chọn tên khác:
# npm --prefix backend run dev:account -- ten_developer
# Cấp lại mật khẩu và thu hồi phiên cũ:
# npm --prefix backend run dev:account -- developer --reset
```

Lệnh sinh mật khẩu ngẫu nhiên và chỉ hiển thị một lần trong terminal; lưu lại để cấp cho developer. Kho tài khoản là `backend/tmp/developer-account.json`, chỉ chứa tên tài khoản, salt và bản băm scrypt; được bỏ qua bởi Git và bị Vite chặn truy cập. Không tự tạo tài khoản mặc định; chạy lại lệnh không ghi đè tài khoản đã có nếu thiếu `--reset`. Tài khoản web vẫn nằm riêng trong MySQL, bảng `btl_cloud.users` (`email`, `password_hash` dùng Argon2id); `backend/.env` chứa thông tin kết nối dịch vụ.

Sau khi đăng nhập developer, công tắc **Backend** chỉ bật/tắt Express; **Developer Mode** chỉ mở bảng Status/chẩn đoán. Hai công tắc độc lập trong phiên được cấp quyền. **Services · Dịch vụ cục bộ** hiển thị trạng thái, cổng, lỗi khởi động và log của Frontend/Backend/MySQL/SeaweedFS. Có bộ lọc dịch vụ/mức log, xóa log hiển thị và sao chép chẩn đoán. Log hiển thị tối đa 500 dòng ở controller (150 dòng trong danh sách); file `backend/tmp/local-services.ndjson` xoay vòng khoảng 2 MiB, giữ một bản `.1`. Lỗi controller lúc boot nằm trong `controller-boot.log`. Mật khẩu, cookie và token được che; token điều khiển trong `local-controller.json` không được trả về UI hay phục vụ qua Vite. Start.vbs/Stop.vbs và CLI tiếp tục dùng quyền truy cập máy local để khởi động/khôi phục dịch vụ.

**Start All** bật các dịch vụ còn thiếu; Vite vẫn có thể lên khi hạ tầng lỗi để xem Services và thử lại. **Stop All** cần xác nhận, dùng được khi Backend/Developer Mode đang OFF, dừng Backend → Frontend → SeaweedFS → MySQL → controller cuối cùng. Dịch vụ do launcher tạo được dừng theo lifecycle phù hợp; nếu chưa dừng hết, controller giữ trạng thái/lỗi để thử lại bằng `run.bat stop`. Sau Stop All phải mở lại bằng Start.vbs hoặc `run.bat start`. Dữ liệu, volume, .env và cấu hình portable được giữ.

Launcher không nhận quản lý tiến trình có sẵn chỉ vì nó chiếm đúng cổng, không dùng `taskkill /im` hay giết theo tên/cổng. Nếu đang chạy phiên launcher cũ hoặc mở `npm run dev` thủ công, hãy tự dừng đúng phiên cũ trước khi chuyển sang launcher mới. Lỗi chiếm cổng được ghi rõ; Stop All không dừng dịch vụ ngoài quyền quản lý. Nếu web không mở được, launcher hiện một thông báo Windows ngắn kèm đường dẫn log. Không tự lặp khởi động khi dịch vụ crash; toast/log báo lỗi, **Start All** khôi phục dịch vụ thiếu để tránh vòng lặp crash.

Docker vẫn tùy chọn: mặc định dùng Docker khi `docker info` thành công, nếu không dùng portable. Có thể chọn `BTL_LOCAL_MODE=portable` hoặc `docker` cho process chạy launcher. Docker dùng nguyên Compose của repo và giữ volume; chỉ dừng container ID do launcher tạo, có ledger local và label đúng thư mục dự án. Container có sẵn do người dùng bật có thể được dùng nhưng được ghi **Ngoài quyền quản lý**, không bị Stop All dừng. Không dừng Docker Desktop, không `compose down -v`. Chế độ chạy được giữ trong phiên controller.

Chỉ báo kết nối luôn hiện, độc lập hai công tắc: sage **Trực tuyến**, amber **Hoạt động hạn chế** (nêu dependency lỗi), coral **Ngoại tuyến**, cyan **Đang kết nối lại**. Dev kiểm tra health mỗi 12 giây khi tab hiện, khi focus, khi mạng trở lại và sau lỗi API. Nút **Thử kết nối lại** kiểm tra ngay. Bản nháp, tệp đã chọn và cache giữ trong trang; uploads/mutations không tự gửi lại. Tránh đóng/tải lại trang khi còn bản nháp.

Toàn bộ launcher/controller/worker nằm ngoài `backend/src` và `backend/dist`; UI Tools chỉ được import trong `import.meta.env.DEV`, cầu nối chỉ đăng ký trong Vite dev. Express production không đăng ký endpoint control/diagnostic. Production giữ chỉ báo kết nối, không thêm polling định kỳ; không sửa AWS, EC2 Auto Scaling, deployment hay tạo tài nguyên cloud. Launcher từ chối NODE_ENV=production hoặc DB/storage không phải loopback. Các biến `BTL_LOCAL_NO_BROWSER=1`, `BTL_LOCAL_NO_NOTIFY=1` chỉ dành cho automation local.

Kiểm tra:

```sh
node --test backend/dev/*.test.mjs
npm --prefix frontend test
npm --prefix frontend exec -- playwright test --config frontend/playwright.local.config.ts
# Sau npm run build:
node scripts/verify/local-production.mjs
```

Suite trình duyệt local cần Chrome, stack đang chạy và biến môi trường `BTL_TEST_DEVELOPER_PASSWORD` bằng mật khẩu được cấp (`BTL_TEST_DEVELOPER_USERNAME` mặc định `developer`). Ví dụ PowerShell: `$env:BTL_TEST_DEVELOPER_PASSWORD='mat-khau-duoc-cap'` trước lệnh Playwright. Suite kiểm tra đăng nhập/phân quyền developer, switch độc lập trong phiên được cấp quyền, log/toast, crash backend, Stop All và mở lại bằng Start.vbs. Các ca readiness DB/storage dùng response lỗi giả lập; không sửa tài liệu người dùng. Unit Docker kiểm tra container ownership và partial failure; cần máy có Docker Desktop để nghiệm thu Docker thật.

## Kiểm thử

Trên Windows, chạy `run.bat stop` trước `npm ci` để tránh khoá Prisma DLL; không cài lại dependency khi app/test còn chạy. Sau chuỗi lint/build/unit, bật lại hạ tầng để chạy integration/E2E; dừng backend dev trước khi dùng backend production-like.

```sh
npm ci
npm run lint
npm run build
npm test
npm --prefix backend run test:integration
npm --prefix frontend test
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
node scripts/verify/authz-matrix.mjs
node scripts/verify/upload-matrix.mjs
```

Integration cần MySQL và storage đang chạy; chỉ reset **btl_cloud_test**. E2E và hai script verify cần backend production-like ở :3000; `test:ui` là suite mock riêng. Nếu chạy lặp nhiều suite bị 429, tăng `AUTH_RATE_LIMIT_MAX=1000` chỉ cho process backend của lần kiểm thử, rồi khởi động lại với mặc định.

## Cấu trúc và đóng góp

`backend/`: Express, Prisma, storage adapter, test; `frontend/`: React/Vite, API client, UI/E2E; `docker/` và `docker-compose.yml`: hạ tầng local; `scripts/`: lệnh chung và kiểm chứng; `docs/`: thiết kế và tiến độ. Xem [§A1.3](docs/ARCHITECTURE.md#a13-cấu-trúc-thư-mục-và-người-phụ-trách) và [§A1.4](docs/ARCHITECTURE.md#a14-quy-tắc-phụ-thuộc): controller gọi service; repository dùng Prisma; adapter storage gọi SDK; frontend gọi mạng qua api/.

Dùng nhánh `feature/*`, `fix/*`, `chore/*`; Conventional Commits; mở PR vào main. PR cần CI `ci-required` đạt và code owner review. Chỉ tick task đã kiểm chứng kèm một dòng bằng chứng; owner tự nghiệm thu gate.

## Lỗi thường gặp

- **Prisma chặn reset bởi AI:** dừng, xin owner câu đồng ý reset đúng DB `btl_cloud_test`; chỉ khi owner trả lời mới đặt `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` bằng nguyên văn câu đó cho process test. Không reset `btl_cloud`.
- **npm allowScripts:** dùng lockfile và cấu hình `allowScripts` trong backend/package.json; thiếu Prisma client thì chạy `npm --prefix backend run prisma:generate`. Không bật mọi install script trên toàn máy.
- **Cổng bị chiếm:** chạy `run.bat stop`, kiểm tra 3306/9000/3000/5173 và dừng đúng process cũ trước khi chạy lại.
- **Đường dẫn tiếng Việt/khoảng trắng:** đặt đường dẫn trong dấu nháy; nếu công cụ không hỗ trợ, clone vào `C:\tmp\btl-clone`. Agent gọi launcher qua `cmd /d /c` với đường dẫn tuyệt đối và working directory rõ ràng; dùng `Start-Process` + `.WaitForExit()`, không pipe output hoặc dùng `-Wait`.
- **SeaweedFS báo `invalid value "release" ... debug`:** bỏ biến DEBUG trong terminal chạy (`Remove-Item Env:DEBUG -ErrorAction SilentlyContinue` với PowerShell, `set DEBUG=` với cmd), rồi chạy lại `run.bat`.
