# Kho tài liệu học tập

Website lưu trữ, tìm kiếm và chia sẻ **PDF, DOCX, PPTX**, tối đa **50 MiB/tệp**.

## Sử dụng website

1. Mở link website và chọn **Đăng ký** hoặc **Đăng nhập**.
2. Tìm theo tiêu đề/mô tả, lọc loại tệp và mở tài liệu để xem thông tin hoặc **Tải xuống**.
3. Chọn **Tải lên tài liệu**, nhập thông tin, chọn tệp và chế độ hiển thị.
4. Vào **Tài liệu của tôi** để sửa thông tin, thay tệp hoặc xoá tài liệu.

Tài liệu **Công khai** có thể được mọi người tìm thấy; cần đăng nhập để tải. Tài liệu **Riêng tư** chỉ chủ sở hữu truy cập được. Chỉ chủ sở hữu được sửa hoặc xoá tài liệu.

**Kiểm tra trùng khi tải lên hoặc thay tệp:**

- Trùng tệp, trùng toàn bộ chữ hoặc giống chữ **trên 85%** với tài liệu của bạn/tài liệu Công khai: từ chối và giữ nguyên tài liệu cũ.
- Giống **70–85%**: cho tải lên, kèm cảnh báo tỷ lệ cụ thể.
- So giống chữ là ước tính theo cụm từ. PDF scan không có lớp chữ chỉ được so trùng tệp.

**Cá nhân hoá** mặc định tắt. Bật tại mục gợi ý để hệ thống học từ tài liệu Công khai của người khác mà bạn xem/tải trong 90 ngày. **Tuỳ chọn gợi ý** cho phép xoá lịch sử hoặc tắt; tắt cũng xoá lịch sử.

## Chạy trên Windows

Cài **Node.js 24**, tải mã nguồn về rồi nhấp **Start.vbs**. Lần đầu cần Internet để tự cài các thành phần. Mở http://localhost:5173; dùng **Stop.vbs** để dừng.

Trên máy có các tiện ích local:

| File | Công dụng |
|---|---|
| `server.bat` | Bật website, tạo link HTTPS và copy link để chia sẻ |
| `admin.bat` | Mở quản trị tại http://localhost:5173/admin |
| `stop server.bat` | Dừng server, admin và link chia sẻ |
| `stop admin.bat` | Dừng admin; giữ server nếu đang chạy |

Mỗi lần khởi động mới đều tự build backend/frontend. Bật thêm chế độ sẽ kế thừa phiên đang chạy. Các file `.bat` và mã admin được Git bỏ qua; bản clone dùng Start.vbs/Stop.vbs.

Sau khi hiện **Đã copy link**, dán bằng **Ctrl+V** để gửi. Giữ máy bật, có mạng và không sleep. Bấm lại `server.bat` để copy link hiện tại; dừng rồi bật lại sẽ có link mới.

## Khi gặp lỗi

| Hiện tượng | Cách xử lý |
|---|---|
| Không nhận lệnh `node` | Cài Node.js 24 rồi chạy lại |
| Dịch vụ chưa sẵn sàng | Chờ khởi động xong; xem **Services** trên máy quản trị |
| Chưa có link hoặc link không vào được | Kiểm tra máy chủ/Internet; xem `backend/tmp/tunnel.log` |
| Vẫn thấy bản cũ sau khi cập nhật | Dừng toàn bộ, bật lại rồi nhấn **Ctrl+F5** |

## Tài liệu

- [Vận hành, cập nhật và sao lưu](docs/WINDOWS_HOSTING.md)
- [Tổng quan dự án](docs/PROJECT_OVERVIEW.md)
- [Kiến trúc và API](docs/ARCHITECTURE.md)
- [Kiểm thử và tệp mẫu](docs/MILESTONES.md)
