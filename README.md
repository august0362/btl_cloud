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

Khi tải lên, hệ thống có thể cảnh báo tệp trùng hoặc nội dung tương tự. Kết quả “chưa kiểm tra” nghĩa là chưa phân tích được nội dung. Gợi ý cá nhân hoá mặc định tắt; bạn có thể bật, tắt và xoá lịch sử trong **Tuỳ chọn gợi ý**.

## Chạy website trên Windows

Cài **Node.js 24**, tải mã nguồn về máy rồi mở thư mục dự án. Lần chạy đầu cần Internet để cài các thành phần cần thiết.

| File | Công dụng |
|---|---|
| `server.bat` | Bật website, tạo link HTTPS và tự copy link vào clipboard |
| `admin.bat` | Mở trang quản trị tại http://localhost:5173/admin |
| `stop server.bat` | Dừng toàn bộ server, admin và link chia sẻ |
| `stop admin.bat` | Dừng chế độ quản trị; giữ server nếu đang chạy |

Các file `.bat` là tiện ích local, được Git bỏ qua. Bản clone thông thường dùng `Start.vbs` để mở web local và `Stop.vbs` để dừng toàn bộ.

Hai chế độ dùng chung dịch vụ. Bật thêm admin hoặc server sẽ giữ tiến trình đang chạy. `stop server.bat` luôn dừng cả hai chế độ. `stop admin.bat` giữ server và link chia sẻ nếu server đang chạy; nếu chỉ có admin thì dừng toàn bộ. Dữ liệu được giữ giữa các lần chạy.

## Chia sẻ cho người khác

1. Nhấp đúp `server.bat` và chờ thông báo **Đã copy link**.
2. Dán link bằng **Ctrl + V** để gửi cho người dùng.
3. Giữ máy chủ bật, có Internet và không sleep trong thời gian chia sẻ.
4. Nhấp `stop server.bat` để dừng chia sẻ và toàn bộ dịch vụ, kể cả admin.

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
