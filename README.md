# BTL Cloud — Kho tài liệu học tập

Lưu trữ và chia sẻ PDF, DOCX, PPTX (tối đa 50 MiB), với tài khoản, kho cá nhân, tìm kiếm và chế độ Công khai/Riêng tư. Hiện là **local prototype**; AWS (M5) chưa làm.

| Tài liệu | Nội dung |
|---|---|
| [PROJECT_OVERVIEW](docs/PROJECT_OVERVIEW.md) | Đọc đầu tiên: trạng thái, yêu cầu, ma trận quyền, phân công AWS cho nhóm |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Thiết kế, schema, hợp đồng API, cấu hình local/AWS |
| [MILESTONES](docs/MILESTONES.md) | Task, bằng chứng, CR, nghiệm thu |
| [WINDOWS_HOSTING](docs/WINDOWS_HOSTING.md) | Host website trên PC Windows cho người dùng từ xa |

## Chạy nhanh

Cài **Node.js 24**. Clone repo vào thư mục mới, mở terminal tại gốc repo.

**Windows (không cần Docker):** nhấp **Start.vbs** (chạy ẩn) hoặc `run.bat start`. Lần đầu launcher tải MySQL 8.4.7 và SeaweedFS 4.48 vào `%LOCALAPPDATA%\btl-cloud-services`, cài dependency, tạo `.env`, áp migration, tạo bucket và mở web (cần mạng). Vào http://localhost:5173/register để tạo tài khoản; không có tài khoản demo mặc định. Dừng bằng **Stop.vbs** hoặc `run.bat stop`; dữ liệu được giữ giữa các lần chạy.

**Docker** (hai terminal):

```sh
docker compose up -d --wait
npm ci
cp backend/.env.example backend/.env      # PowerShell: Copy-Item
npm --prefix backend run prisma:deploy
npm --prefix backend run storage:init
npm --prefix backend run dev
# Terminal thứ hai:
npm --prefix frontend run dev
```

| Dịch vụ | URL/cổng |
|---|---|
| Frontend dev | http://localhost:5173 (proxy /api → backend) |
| Backend / health / readiness | http://localhost:3000/api/health · /api/health/ready |
| MySQL / S3-compatible storage | 127.0.0.1:3306 / http://localhost:9000 |

**Production-like:** `npm run build`, đặt biến của process `SERVE_FRONTEND=true` (PowerShell `$env:SERVE_FRONTEND='true'`), chạy `npm --prefix backend start`; SPA và API cùng http://localhost:3000. Không commit `.env`.

## Launcher và công cụ developer

**Tài khoản developer** (một lần cho mỗi bản sao, sau `npm ci`):

```sh
npm --prefix backend run dev:account -- ten_cua_ban
# Cấp lại mật khẩu và thu hồi phiên cũ:
npm --prefix backend run dev:account -- ten_cua_ban --reset
```

Mật khẩu ngẫu nhiên chỉ in một lần. `backend/tmp/developer-account.json` chỉ giữ tên, salt, hash scrypt; được Git bỏ qua và Vite chặn phục vụ. Tài khoản website là chuyện khác, nằm trong bảng `btl_cloud.users`.

**Launcher:** `run.bat` / `run.bat start`, `run.bat stop`, `run.bat restart`, `run.bat status` (trạng thái + log đã lọc bí mật). Bấm Start khi đã chạy thì chỉ mở lại web. Controller duy nhất ở **127.0.0.1:3001** khởi động MySQL/SeaweedFS → Express :3000 → Vite :5173, giữ PID/handle nó tạo và ghi log vào `backend/tmp/local-services.ndjson` (xoay ở 2 MiB, giữ `.1`). Backend không có watcher: sửa mã backend xong thì **Khởi động lại**.

- Không nhận quản lý tiến trình có sẵn chỉ vì nó chiếm đúng cổng, không giết theo tên/cổng; tự dừng phiên cũ (hoặc `npm run dev` thủ công) trước khi chạy launcher.
- Docker tuỳ chọn: dùng Docker khi `docker info` thành công, ngược lại dùng portable; ép bằng `BTL_LOCAL_MODE=portable` hoặc `docker`. Chỉ dừng container do launcher tạo; không `compose down -v`.
- Từ chối `NODE_ENV=production` hoặc DB/storage không phải loopback. Toàn bộ launcher/controller nằm ngoài `backend/src`, không có trong bản build.

**Trang quản trị** http://localhost:5173/admin (link **Quản trị**, chọn **Đăng nhập nhà phát triển**): Dashboard số liệu và hiệu năng, điều khiển Backend/Start All/Stop All, Services và log, Users, Activity, Errors, Trực tiếp. Phiên developer là cookie HttpOnly, SameSite=Strict, tối đa 8 giờ; vẫn đăng nhập được khi Express/MySQL tắt. Mã admin nằm trong thư mục gitignore (`backend/admin/`, `frontend/src/admin/`, `frontend/admin-tests/`), chỉ có trên máy owner; clone không có thì web không có link **Quản trị** và Start All vẫn chạy.

## Kiểm thử

Trên Windows, chạy `run.bat stop` trước `npm ci` để tránh khoá Prisma DLL.

```sh
npm ci && npm run lint && npm run build && npm test     # giống CI
npm --prefix backend run test:integration              # cần MySQL + storage; chỉ reset btl_cloud_test
node --test backend/dev/*.test.mjs                      # launcher/controller
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e                      # cần backend production-like :3000
npm --prefix frontend run test:ui                       # API mock, không cần backend
node scripts/verify/authz-matrix.mjs                    # cần :3000
node scripts/verify/upload-matrix.mjs                   # cần :3000
node scripts/verify/admin-isolation.mjs                 # sau npm run build
node scripts/verify/local-production.mjs                # sau npm run build
```

Nếu chạy lặp nhiều suite bị 429, đặt `AUTH_RATE_LIMIT_MAX=1000` chỉ cho process backend của lần kiểm thử. Test admin (chỉ máy có admin): `npm --prefix backend exec -- vitest run --config admin/vitest.config.ts`; Playwright admin cần `BTL_TEST_DEVELOPER_PASSWORD`. Thử tải trên DB/bucket riêng: [scripts/load/README.md](scripts/load/README.md).

## Đóng góp

Nhánh `feature/*`, `fix/*`, `chore/*`; Conventional Commits; PR vào `main` cần CI `ci-required` và code owner review. Quy tắc phụ thuộc: [§A1.4](docs/ARCHITECTURE.md#a14-quy-tắc-phụ-thuộc) (controller gọi service; chỉ repository dùng Prisma; chỉ adapter storage gọi AWS SDK; frontend gọi mạng qua `api/`).

## Lỗi thường gặp

- **Prisma chặn reset bởi AI:** xin owner câu đồng ý reset đúng DB `btl_cloud_test`; chỉ khi owner trả lời mới đặt `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION` bằng nguyên văn câu đó cho process test. Không reset `btl_cloud`.
- **npm allowScripts:** dùng cấu hình `allowScripts` trong `backend/package.json`; thiếu Prisma client thì `npm --prefix backend run prisma:generate`.
- **Cổng bị chiếm:** `run.bat stop`, kiểm tra 3306/9000/3000/5173 và dừng đúng process cũ.
- **Đường dẫn tiếng Việt/khoảng trắng:** đặt trong dấu nháy; nếu công cụ không hỗ trợ, clone vào `C:\tmp\btl-clone`. Gọi launcher từ script: `Start-Process` + `.WaitForExit()`, không pipe output hoặc dùng `-Wait`.
- **SeaweedFS báo `invalid value "release" ... debug`:** bỏ biến DEBUG (`Remove-Item Env:DEBUG -ErrorAction SilentlyContinue` hoặc `set DEBUG=`) rồi chạy lại `run.bat`.
