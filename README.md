# Kho tài liệu học tập

Lưu trữ, tìm kiếm và chia sẻ tài liệu **PDF, DOCX, PPTX**, tối đa **50 MiB/tệp**. Mỗi tài liệu có thể để Công khai hoặc Riêng tư.

## Sử dụng website

Nếu đã nhận được link website, bạn chỉ cần mở link bằng trình duyệt.

1. Chọn **Đăng ký** để tạo tài khoản hoặc **Đăng nhập** nếu đã có tài khoản.
2. Tìm tài liệu bằng tiêu đề hoặc mô tả; lọc theo loại tệp và cách sắp xếp.
3. Mở trang chi tiết và chọn **Tải xuống**. Bạn cần đăng nhập để tải.
4. Chọn **Tải lên tài liệu**, nhập thông tin, chọn tệp và chế độ hiển thị.
5. Vào **Tài liệu của tôi** để sửa thông tin, thay tệp hoặc xoá tài liệu.

**Công khai:** mọi người có thể tìm và xem thông tin. **Riêng tư:** chỉ bạn truy cập được. Chỉ chủ sở hữu được sửa hoặc xoá tài liệu.

Khi tải lên hoặc thay tệp, API trả 409 và loại bản tải lên (không tạo tài liệu mới) nếu trùng SHA-256 hoặc giống chữ từ 90% với tài liệu có thể xem. Từ 70% đến dưới 90% vẫn cho upload và hiển thị cảnh báo đến khi người dùng đóng. PDF không có lớp chữ hoặc ngoài giới hạn trích chữ vẫn được so SHA-256. Worker bận/lỗi/timeout, lỗi truy vấn so sánh hoặc không thể quét đủ ứng viên trả 503 để thử lại, không cho qua kiểm tra. Gợi ý cá nhân hoá mặc định tắt; bạn có thể bật, tắt và xoá lịch sử trong **Tuỳ chọn gợi ý**.

## Chạy website trên Windows

Cài **Node.js 24**, tải mã nguồn về máy rồi mở thư mục dự án. Lần chạy đầu cần Internet để cài các thành phần cần thiết.

| File | Công dụng |
|---|---|
| `server.bat` | Bật website, tạo link HTTPS và tự copy link vào clipboard |
| `admin.bat` | Mở trang quản trị tại http://localhost:5173/admin |
| `stop server.bat` | Dừng chia sẻ qua link public |
| `stop admin.bat` | Dừng chế độ quản trị |

Các file `.bat` là tiện ích local, được Git bỏ qua. Bản clone thông thường dùng `Start.vbs` để mở web local và `Stop.vbs` để dừng toàn bộ.

Hai chế độ dùng chung dịch vụ. Bật thêm admin hoặc server sẽ giữ tiến trình đang chạy. Dừng một chế độ vẫn giữ dịch vụ cho chế độ còn lại; dừng chế độ cuối cùng sẽ tắt toàn bộ. Dữ liệu được giữ giữa các lần chạy.

## Chia sẻ cho người khác

1. Nhấp đúp `server.bat` và chờ thông báo **Đã copy link**.
2. Dán link bằng **Ctrl + V** để gửi cho người dùng.
3. Giữ máy chủ bật, có Internet và không sleep trong thời gian chia sẻ.
4. Nhấp `stop server.bat` khi muốn ngừng chia sẻ.

Bấm lại `server.bat` sẽ copy lại link hiện tại. Sau khi dừng rồi bật lại, link sẽ thay đổi. Người nhận không cần cài ứng dụng hay tải mã nguồn.

## Khi gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Không nhận lệnh `node` | Cài Node.js 24, mở lại thư mục và chạy lại |
| Chưa có link hoặc báo lỗi tunnel | Kiểm tra Internet; xem `backend/tmp/tunnel.log`, rồi chạy lại `server.bat` |
| Trang báo dịch vụ chưa sẵn sàng | Chờ khởi động xong; trên máy quản trị, mở mục **Services** để xem lỗi |
| Link không vào được | Kiểm tra máy chủ còn chạy, có mạng và chưa sleep; lấy lại link bằng `server.bat` |

Tài khoản quản trị là tài khoản developer riêng, khác tài khoản website. Cách thiết lập, sao lưu và cập nhật nằm trong [hướng dẫn quản trị Windows](docs/WINDOWS_HOSTING.md).

## Tài liệu dự án

- [Tổng quan và phạm vi](docs/PROJECT_OVERVIEW.md)
- [Kiến trúc và API](docs/ARCHITECTURE.md)
- [Kiểm thử](docs/MILESTONES.md)
- [Vận hành trên Windows](docs/WINDOWS_HOSTING.md)

## Dọn bản Private trùng Public (local)

Upload chặn từ 90% trở lên, cảnh báo từ 70% đến dưới 90% (giữ thông báo đến khi người dùng đóng), kể cả khi `.env` cũ còn `DUPLICATE_MODE=warn` hoặc `off`. Có một migration cộng thêm bảng khoá ingest dùng chung để tuần tự hoá lần kiểm tra cuối giữa các tài khoản/instance. Launcher áp migration khi khởi động; nếu chạy thủ công, chạy `npm --prefix backend run prisma:deploy` trước backend mới. Không reset DB.

Đối với dữ liệu cũ, lệnh quản trị dưới đây chỉ dọn bản **Private trùng SHA-256 100%** với Public còn tồn tại, kể cả khác chủ sở hữu. Không tự xoá tài liệu cũ chỉ vì giống chữ 90%. Giữ MySQL và SeaweedFS local đang chạy; chạy từ `backend/`:

```sh
npx tsx --env-file=.env scripts/backfill-fingerprints.ts
npx tsx --env-file=.env scripts/cleanup-private-duplicates.ts
```

Lệnh thứ hai chỉ tạo kế hoạch trong `tmp/` và in các ID Private sẽ xoá / Public sẽ giữ. Xem kế hoạch, rồi áp dụng **đúng file đã xem** (thay đường dẫn bằng file lệnh vừa tạo):

```sh
npx tsx --env-file=.env scripts/cleanup-private-duplicates.ts --apply --plan=tmp/private-duplicate-plan-123.json
```

Trước khi xoá, công cụ đọc lại bytes của cả hai object, xác minh SHA-256 và khoá/kiểm lại metadata, fingerprint, visibility và phiên bản trong transaction. Bản Public đổi tệp, đổi sang Private, mất object, bị xoá hoặc chủ đang DELETING sẽ làm ứng viên bị bỏ qua. Lần xoá metadata Private được ghi audit trong cùng transaction. Sau khi commit, object Private được xoá; fingerprint/tương tác mất theo CASCADE. `storageDeleteFailed` là các ID có metadata đã xoá nhưng dọn object thất bại, cần xử lý tiếp từ storage key trong kế hoạch. Công cụ từ chối DB/storage ngoài loopback và không chạm AWS.
