# BTL Cloud — Kho tài liệu học tập

Lưu trữ và chia sẻ PDF, DOCX, PPTX (tối đa 50 MiB), với tài khoản, kho cá nhân, tìm kiếm và chế độ Công khai/Riêng tư. Hiện là **local prototype**; M4-07/08 hoãn (CR-005), M5 (AWS) chưa làm. Tiến độ: [MILESTONES](docs/MILESTONES.md).

## Yêu cầu và chạy nhanh

Cài **Node.js 24** (kèm npm); dùng Docker Desktop hoặc Windows với `run.bat` khi không có Docker. Clone repo vào thư mục mới, mở terminal tại gốc repo.

**Windows:** chạy `run.bat`. Lần đầu script tải MySQL 8.4.7 và SeaweedFS 4.48 vào `%LOCALAPPDATA%\btl-cloud-services`, cài dependency, tạo `.env`, áp migration, tạo bucket và mở web. Đợi “Đã chạy xong”, vào http://localhost:5173/register để tạo tài khoản; đăng xuất rồi đăng nhập tại `/login`. Dừng toàn bộ bằng `run.bat stop`. Dữ liệu portable được giữ giữa các lần chạy.

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

## Kiểm thử

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
