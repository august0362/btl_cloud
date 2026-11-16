# Tổng quan dự án

Kho tài liệu học tập là bài tập lớn môn Điện toán đám mây (INT3319). Phạm vi gồm các chức năng đã triển khai dưới đây. Cách dùng nằm trong [README](../README.md).

| Nhóm | Chức năng |
|---|---|
| Tài khoản | Đăng ký, đăng nhập, đăng xuất và phiên bằng cookie |
| Kho tài liệu | Upload, tải xuống, sửa thông tin, thay tệp, xoá; Công khai/Riêng tư |
| Khám phá | Tìm theo tiêu đề/mô tả, lọc loại tệp, sắp xếp và phân trang |
| So trùng | SHA-256 cho tệp, MinHash cho chữ; chặn hoặc cảnh báo khi upload/thay tệp |
| Gợi ý | Cá nhân hoá theo xem/tải, tài liệu nổi bật/liên quan và gợi ý khi gõ |
| Quản trị local | Người dùng, hoạt động, lỗi, số liệu hiệu năng và điều khiển dịch vụ |
| Chia sẻ | Link HTTPS; admin/server dùng chung tiến trình, dừng theo chế độ |

## Quyền và dữ liệu

Public cho xem thông tin; tải tệp cần đăng nhập. Private chỉ chủ sở hữu xem/tải. Sửa, thay tệp và xoá luôn kiểm quyền chủ tài liệu. Tài liệu không được phép xem trả 404; so trùng và gợi ý cũng áp dụng phạm vi này.

MySQL lưu tài khoản, phiên, metadata, fingerprint và lịch sử cá nhân hoá. Object storage giữ tệp; chỉ mục gợi ý trong RAM có thể dựng lại. Không có tài khoản demo mặc định.

## Môi trường

- **Windows:** Node.js 24, MySQL/SeaweedFS portable; Cloudflare Quick Tunnel để chia sẻ.
- **Docker tuỳ chọn:** cung cấp MySQL/SeaweedFS cho phát triển và kiểm thử; ứng dụng chạy bằng Node.
- **Triển khai máy chủ:** backend hỗ trợ MySQL và S3 qua cấu hình môi trường, có thể chạy sau reverse proxy. Hạ tầng AWS không được tạo bởi repository này; kết quả kiểm thử được ghi nhận là local.

Chi tiết tại [kiến trúc](ARCHITECTURE.md), [vận hành](WINDOWS_HOSTING.md) và [kiểm thử](MILESTONES.md).

## Phân công nhóm

| Thành viên | Phụ trách |
|---|---|
| Trần Anh Việt | VPC, subnet, routing, security group, ALB và tích hợp |
| Trương Công Mạnh | Backend, artifact, cấu hình, migration và nghiệp vụ |
| Dương Quân Bảo | RDS, S3, EBS và IAM Role |
| Phạm Đức Trọng | Launch template/ASG, CloudWatch, thử tải và chi phí |
