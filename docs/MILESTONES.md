# Kiểm thử

Phạm vi: [PROJECT_OVERVIEW](PROJECT_OVERVIEW.md). Hợp đồng: [ARCHITECTURE](ARCHITECTURE.md). Tài liệu ghi các bộ kiểm thử hiện có và kết quả kiểm chứng local.

## Trạng thái bàn giao

| Phần | Trạng thái |
|---|---|
| Tài khoản, kho tài liệu, Public/Private | Đã triển khai |
| Admin local, metrics và audit | Đã triển khai; thư mục admin chỉ có trên máy owner |
| Launcher admin/server và Quick Tunnel | Đã triển khai; dùng chung tiến trình, dừng theo chế độ |
| So trùng SHA-256/MinHash và gợi ý TF-IDF | Đã triển khai trong mã nguồn; migration document_intelligence đã có |

Kiểm chứng local **16/11/2026**: lint/build, liên kết tài liệu và cách ly artifact đạt; backend unit 168, frontend unit 101, launcher 44, admin local 44, UI trình duyệt 9. Integration kiểm được 118 ca qua lượt đầy đủ và lần chạy lại riêng ca BUSY sau khi sửa; một benchmark bỏ qua mặc định. Đây không phải kết quả nghiệm thu AWS.

Bộ so trùng với tệp thật bổ sung cùng ngày đạt **24/24 ca** qua HTTP, MySQL và SeaweedFS test: ba định dạng cho cùng tỷ lệ 100%, 92,1875%, 85,15625%, 75,78125% và 36,71875%. Kiểm được cả tải xuống rồi upload lại, Public/Private, khác tài khoản, khác định dạng, từ chối trước khi ghi storage và giữ nguyên bản cũ khi thay tệp bị chặn. Đây là dữ liệu tổng hợp với PDF có lớp chữ; PDF scan không có lớp chữ chỉ được so trùng tệp bằng SHA-256.

Kiểm chứng cá nhân hoá cùng ngày: **20 ca API** (12 hợp đồng và 8 luồng đọc/tải thật), **22 unit backend**, **7 unit frontend** và **2 ca trình duyệt** đạt. Một ca Chrome dùng frontend build, HTTP, MySQL và S3 local thật; ca còn lại dùng API giả lập để kiểm tra bàn phím và WCAG AA. Hai tài khoản đọc Cloud/AI nhận gợi ý khác nhau; xóa lịch sử chỉ tác động tài khoản hiện tại; tắt được giữ sau đăng nhập lại/tải lại trang. Có kiểm tra lỗi tải S3, cache cũ khi tài liệu đổi quyền/xoá, và ưu tiên tiêu đề khớp truy vấn. Các ca mới tạo lịch sử qua API xem/tải, không chèn lịch sử bằng SQL.

## Kiểm tra mã nguồn

Tại gốc repo, dùng Node.js 24:

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

Trên Windows, dừng dịch vụ bằng Stop.vbs trước khi cài lại dependency để tránh khoá Prisma DLL. `npm ci` tự cài hai package và sinh Prisma client; không dùng dependency cũ khi schema/package-lock đã đổi.

Integration cần MySQL và SeaweedFS. Dùng DB tên kết thúc `_test`, bucket riêng; fixture sẽ xoá dữ liệu trong môi trường test:

```sh
npm --prefix backend run test:integration
# Chi rieng 24 ca so trung voi 18 tep DOCX/PDF/PPTX that:
npm --prefix backend run test:integration -- duplicates-real-files
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:ui
# E2E cần backend production-like trên :3000:
npm --prefix frontend run test:e2e
```

Setup integration chỉ deploy migration, không reset schema.

Máy có thư mục admin có thể chạy thêm `npm exec -- vitest run --config admin/vitest.config.ts` trong `backend/`, sau integration. Bộ này dùng cùng DB test nên không chạy song song với integration.

## Phạm vi kiểm thử

| Nhóm | Hành vi được kiểm | Bằng chứng tự động |
|---|---|---|
| Quyền | Guest/A/B, Public/Private, chủ DELETING, download cần đăng nhập | integration documents-access/deleting-user; `scripts/verify/authz-matrix.mjs` |
| Tệp | Ba loại tệp, giả/rỗng, 50 MiB/+1, thay/xoá và lỗi storage/DB | integration documents-*; `scripts/verify/upload-matrix.mjs` |
| So trùng | warn/off/block; bản Private của Public người khác; loại chính tài liệu; transaction phiên bản | integration duplicates-flow/query-budget |
| Tệp so trùng thực tế | 18 DOCX/PDF/PPTX; 100%, trên 85%, cảnh báo 70-85%, dưới 70%; download/upload lại và thay tệp | [Mẫu và cách chạy](../backend/test/fixtures/duplicate-documents/README.md); integration duplicates-real-files |
| Phân tích chữ | PDF/Office, dấu tiếng Việt, scan/hỏng/mã hoá, PARTIAL/SKIPPED, timeout/hàng đợi | unit duplicates-*; document-foundation |
| Gợi ý | Opt-in mặc định tắt, bật/tắt/xoá lịch sử, popularity, Private/DELETING khi index cũ | integration recommendations-api |
| Cá nhân hoá qua hành vi | Hồ sơ Cloud/AI riêng biệt, VIEW/DOWNLOAD không nhân bản, tắt/xoá rồi học lại, cách ly tài khoản | [recommendations-journey](../backend/test/integration/recommendations-journey.test.ts); [Chrome E2E thật](../frontend/e2e/personalization.spec.ts) |
| Tìm relevance | Query thắng sở thích, phân trang qua mốc 200, fallback và tắt tính năng | unit ranking/search; integration recommendations-api |
| UI | Lỗi giữ form, hiển thị cảnh báo, mục gợi ý lỗi bị ẩn, combobox/debounce/abort | frontend unit; `ui-tests/recommendations.spec.ts` |
| Launcher | Hai thứ tự bật, click lặp, stop từng chế độ, không đổi PID, không giết process khác | backend dev tests |
| Cách ly admin | Clone không có admin vẫn chạy, public không có control/log/secret | admin-isolation và local-production |

## Công cụ đánh giá hiện có

Chạy lại riêng phần cá nhân hoá, tại gốc dự án sau khi bật MySQL/SeaweedFS local:

```sh
npm --prefix backend test -- recommendations
npm --prefix frontend test -- recommendations
npm --prefix backend run test:integration -- recommendations-api recommendations-journey
# Frontend da build; can Google Chrome. Chay sau integration, khong chay song song:
npm --prefix frontend run test:e2e -- personalization.spec.ts
npm --prefix frontend run test:ui -- recommendations.spec.ts
```

[Fixture cá nhân hoá](../backend/test/fixtures/personalization-scenario.ts) dùng catalog ba chủ đề AWS Cloud, AI/ML và Giải tích, có Public/Private và chủ đang xoá. Hai tài liệu nguồn có object PDF thật để kiểm tra tải xuống. Fixture từ chối DB/storage ngoài loopback, DB không kết thúc `_test` hoặc bucket không kết thúc `-test`. Các tài khoản, tương tác và object của ca thử được dọn khi kết thúc; không chạy đồng thời với các bộ khác dùng chung DB test.

- `node scripts/eval/duplicate-eval.mjs dataset.json`: đánh giá so trùng với dataset dạng `[{ left, right, duplicate }]`.
- `node scripts/eval/duplicate-eval.mjs --benchmark`: đo SHA-256, MinHash và worker sau khi build backend.
- `backend/test/fixtures/rec-eval.ts` và integration benchmark: dữ liệu tổng hợp và phép đo chỉ mục gợi ý.
- [scripts/load/README](../scripts/load/README.md): thử tải tìm kiếm, tải xuống và đăng nhập trên DB/bucket riêng.

## Trạng thái phụ thuộc

Bản hiện tại dùng Multer 2.5.0, body-parser 2.4.0 và ESLint 10.15.0. Báo cáo `npm audit` local ngày 16/11/2026 còn ghi nhận cảnh báo ở Zod 3, Prisma 6/deepmerge-ts và typescript-eslint/minimatch.
