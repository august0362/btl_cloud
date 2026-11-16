# Kiểm thử

Kiểm thử gồm unit, API với MySQL/S3 local, giao diện với API giả lập và E2E qua trình duyệt thật. Phạm vi sản phẩm: [PROJECT_OVERVIEW](PROJECT_OVERVIEW.md).

## Kiểm tra mã nguồn

Tại gốc dự án, dùng Node.js 24:

```sh
npm ci
npm run docs:check
npm run lint
npm run build
npm test
npm --prefix backend run test:launcher
node scripts/verify/admin-isolation.mjs
node scripts/verify/local-production.mjs
```

Dừng dịch vụ trước `npm ci` để tránh khoá Prisma DLL. Unit/launcher không cần MySQL hoặc S3; hai lệnh kiểm artifact cần build trước. Build frontend kiểm ứng dụng/UI test; lint kiểm thêm E2E bằng cấu hình TypeScript riêng, không kéo backend vào build frontend.

## API và trình duyệt

Bật MySQL/SeaweedFS local. Integration dùng database `btl_cloud_test`, bucket `btl-cloud-documents-test`; có thể ghi đè qua `TEST_*`. Database phải kết thúc `_test`. Setup deploy migration; fixture xoá dữ liệu test. Chạy tuần tự, kể cả test admin riêng trên máy owner.

```sh
# Toàn bộ API; chỉ so trùng tệp thật; chỉ cá nhân hoá
npm --prefix backend run test:integration
npm --prefix backend run test:integration -- duplicates-real-files
npm --prefix backend run test:integration -- recommendations-api recommendations-journey

# UI với API giả lập, cần Google Chrome và frontend đã build
npm --prefix frontend run test:ui

# Cá nhân hoá qua frontend/API/MySQL/S3 thật; chạy sau integration, cần Chrome
npm --prefix frontend run test:e2e -- personalization.spec.ts
```

Các E2E còn lại dùng backend trên `localhost:3000`: `npm --prefix frontend run test:e2e`. Không dùng dữ liệu thật cho các kịch bản tạo/sửa/xoá tài liệu.

## Phạm vi và kết quả

Kiểm chứng local ngày **16/11/2026**:

| Bộ | Nội dung |
|---|---|
| Unit | 173/173 backend, 110/110 frontend; validate, quyền, vòng đời, storage, so trùng và xếp hạng |
| Launcher | 51/51; build, kế thừa PID, hai thứ tự bật, stop từng chế độ, bảo toàn process khác |
| [So trùng tệp thật](../backend/test/fixtures/duplicate-documents/README.md) | 24/24 ca; 18 DOCX/PDF/PPTX; trùng tệp/chữ, hai phía ngưỡng chặn, tải lại và thay tệp |
| [API cá nhân hoá](../backend/test/integration/recommendations-journey.test.ts) | 20/20 ca gồm hợp đồng và hành vi; tạo lịch sử qua API, cách ly tài khoản, tắt/xoá/học lại |
| [Chrome cá nhân hoá](../frontend/e2e/personalization.spec.ts) | 1/1 E2E thật; Cloud/AI nhận gợi ý khác nhau, tuỳ chọn giữ sau reload |
| UI cá nhân hoá | 1/1 ca Chrome với API giả lập, bàn phím và WCAG AA; 7/7 unit frontend |
| Artifact | Kiểm code admin, control local và log không xuất hiện trong bản public |

Các kết quả trên dùng dữ liệu tổng hợp. PDF so chữ có lớp chữ; PDF scan chỉ so SHA-256. Kiểm thử không xác nhận trạng thái triển khai AWS.

## Dữ liệu mẫu và công cụ

- [Tệp so trùng](../backend/test/fixtures/duplicate-documents/README.md): tải từng cặp để thử tay; chỉ tạo lại cần Word/PowerPoint.
- [Fixture cá nhân hoá](../backend/test/fixtures/personalization-scenario.ts): catalog Cloud/AI/Giải tích, Public/Private và chủ đang xoá; có PDF thật cho nguồn tải.
- `node scripts/eval/duplicate-eval.mjs dataset.json` hoặc `--benchmark`: đánh giá chữ/tệp sau khi build backend.
- [Thử tải](../scripts/load/README.md): seed và chạy tìm kiếm/tải xuống/đăng nhập trên DB/bucket riêng.
