# Tổng quan dự án

Kho tài liệu học tập là bài tập lớn môn Điện toán đám mây (INT3319). Người dùng quản lý tài liệu của mình và chia sẻ tài liệu công khai qua website.

Cách sử dụng: [README](../README.md). Thiết kế và API: [ARCHITECTURE](ARCHITECTURE.md). Kiểm thử: [MILESTONES](MILESTONES.md). Vận hành local: [WINDOWS_HOSTING](WINDOWS_HOSTING.md).

## Phạm vi

Phạm vi dự án được chốt ở các chức năng đã triển khai dưới đây.

| Nhóm chức năng | Hành vi |
|---|---|
| Tài khoản | Đăng ký, đăng nhập, đăng xuất, phiên đăng nhập bằng cookie |
| Khám phá | Tìm theo tiêu đề/mô tả, lọc PDF/DOCX/PPTX, sắp xếp và phân trang |
| Kho cá nhân | Tải lên, sửa thông tin, đổi Công khai/Riêng tư, thay tệp và xoá |
| Tải xuống | Người đã đăng nhập tải tài liệu được phép truy cập |
| So trùng | SHA-256 cho tệp giống hệt; MinHash cho nội dung chữ tương tự |
| Gợi ý | Tài liệu nổi bật/cá nhân hoá, tài liệu liên quan, gợi ý khi gõ và tìm kiếm theo độ liên quan |
| Quản trị local | Trạng thái dịch vụ, người dùng, hoạt động, lỗi và số liệu hiệu năng trên máy quản trị |
| Chia sẻ Windows | Tạo link HTTPS, dùng chung tiến trình giữa admin/server, dừng từng chế độ |

Tệp hợp lệ: PDF, DOCX, PPTX, tối đa 52.428.800 byte, một tệp mỗi request. Tìm kiếm dựa trên tiêu đề và mô tả. Không có tài khoản demo mặc định.

## Quyền truy cập

| Hành động | Chưa đăng nhập | Người khác | Chủ tài liệu |
|---|---|---|---|
| Tìm/xem thông tin Công khai | Có | Có | Có |
| Tải tệp Công khai | Đăng nhập trước | Có | Có |
| Xem/tải tài liệu Riêng tư | Không | Không | Có |
| Tải lên | Đăng nhập trước | Có | Có |
| Sửa, thay tệp, xoá | Không | Không | Có |

Tài liệu không được phép xem trả 404. Người dùng không nhận id, tiêu đề hay độ tương đồng của tài liệu Riêng tư thuộc người khác. Tài khoản đang xoá bị loại khỏi ứng dụng public, so trùng và gợi ý.

## So trùng và gợi ý

**So trùng:** mặc định `DUPLICATE_MODE=warn`, chỉ cảnh báo. Chế độ `block` chặn tệp giống hệt tài liệu của chính mình; với tài liệu Công khai của người khác, chỉ chặn khi bản mới cũng Công khai. Tạo bản Riêng tư của tài liệu Công khai vẫn được phép. Nội dung gần giống luôn chỉ cảnh báo. Không tự xoá hay gộp tài liệu.

**Gợi ý:** mặc định không lưu lịch sử cá nhân. Sau khi người dùng đồng ý, hệ thống ghi xem/tải tài liệu Công khai của người khác và giữ 90 ngày. Tắt cá nhân hoá sẽ xoá lịch sử; có nút xoá lịch sử riêng. Không lưu từ khoá tìm kiếm. Kết quả tìm kiếm ưu tiên mức khớp truy vấn trước sở thích cá nhân.

Hai tính năng chạy trong backend hiện có, dùng chung MySQL và object storage. Fingerprint và lịch sử nằm trong DB; chỉ mục gợi ý trong RAM có thể dựng lại và không quyết định quyền truy cập.

## Trạng thái

- Backend, frontend, quản trị local, launcher, so trùng và gợi ý đã có mã nguồn cùng kiểm thử trong repository.
- Migration `20261115172311_document_intelligence` bổ sung fingerprint, tương tác và tuỳ chọn cá nhân hoá.
- Cấu hình AWS được ghi theo bàn giao ngày **15/11/2026**. Kết quả kiểm thử trong repository là kết quả local.

## Môi trường chạy

| Môi trường | Cấu hình |
|---|---|
| Windows | Node.js 24; MySQL/SeaweedFS portable mặc định; Cloudflare Quick Tunnel khi chia sẻ |
| Docker tuỳ chọn | Compose chỉ cung cấp MySQL và SeaweedFS, hữu ích cho Linux/macOS và integration test; app vẫn chạy bằng Node |
| AWS theo bàn giao | `ap-southeast-2`, VPC 2 AZ, EC2 private không NAT, ALB HTTP:80 → app:3000, RDS MySQL và S3 |

AWS dùng ASG `prj-app-asg`, t3.micro 1 GiB, min 1/max 6, launch template v3; RDS Single-AZ dùng schema `webdb`. Artifact và cấu hình được tải từ S3 khi tạo instance. Chi tiết cấu hình nằm trong [ARCHITECTURE](ARCHITECTURE.md).

## Phân công nhóm

| Thành viên | Phụ trách |
|---|---|
| Trần Anh Việt | VPC, subnet, routing, security group, ALB và tích hợp |
| Trương Công Mạnh | Backend, artifact, cấu hình ứng dụng, migration và kiểm chứng nghiệp vụ |
| Dương Quân Bảo | RDS, S3, EBS và IAM Role |
| Phạm Đức Trọng | Launch template/ASG, CloudWatch, thử tải và chi phí |
