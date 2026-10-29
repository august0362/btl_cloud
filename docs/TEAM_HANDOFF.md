# Bàn giao để nhóm làm tiếp

Đối chiếu ngày 29/10/2026 với hai tài liệu trong `pdf/`:

- [Hướng dẫn bài tập lớn](../pdf/Bài%20tập%20lớn%20cuối%20kỳ%20-%20Hướng%20dẫn.pdf), trang 1–3: tám hạng mục bắt buộc, sản phẩm nộp, trách nhiệm cá nhân và hạn nộp.
- [Đề xuất của nhóm](../pdf/Đề%20xuất%20BTL%20Cloud%20Trần%20Anh%20Việt%2024020362.pdf), trang 1–3: thành viên, kiến trúc, phân công và demo 10 phút.

## 1. Điểm bắt đầu

Ứng dụng local đã có backend, frontend, MySQL, storage tương thích S3, kiểm thử và bộ điều khiển dịch vụ local. Tiến độ trong [MILESTONES](MILESTONES.md) ghi M4 local còn chờ diễn tập/nghiệm thu của nhóm trưởng; kiểm tra lỗi storage thật và nhiều instance đã hoãn. M5 chuẩn bị AWS còn chưa làm. Chưa có hệ thống AWS chạy thật được nghiệm thu trong repo này.

Theo hướng dẫn PDF, phần CLO4 chiếm 80% điểm bài tập lớn và yêu cầu hạ tầng chạy/demo được. Việc tiếp theo của nhóm là hoàn thành tám hạng mục cloud dựa trên ứng dụng đã có. Mỗi người vẫn cần hiểu, kiểm chứng và giải thích được phần mình cùng kiến trúc tổng thể.

**Nhánh bàn giao:** [`chore/local-developer-handoff`](https://github.com/august0362/btl_cloud/tree/chore/local-developer-handoff), gồm launcher, công cụ developer và hướng dẫn này. Thành viên clone đúng nhánh để nhận đầy đủ bản bàn giao. `pdf/` được Git bỏ qua; gửi riêng hai PDF cho nhóm.

## 2. Mỗi thành viên chạy trên máy mình

Cài Node.js 24 và Git. Trên Windows, chạy:

```powershell
git clone --branch chore/local-developer-handoff https://github.com/august0362/btl_cloud.git BTL_Cloud
cd BTL_Cloud
npm ci
npm --prefix backend run dev:account -- ten_cua_ban
.\run.bat start
```

Lệnh cấp tài khoản in mật khẩu ngẫu nhiên một lần. Mở `http://localhost:5173`, chọn **Đăng nhập nhà phát triển** để mở bộ điều khiển dịch vụ. Lần chạy đầu launcher chuẩn bị cấu hình, dịch vụ local, migration và bucket; cần kết nối mạng. Docker Desktop là tuỳ chọn; launcher có bản MySQL/SeaweedFS portable trên Windows.

Tài khoản `admin` đã đặt trên máy hiện tại nằm trong `backend/tmp/developer-account.json`, được Git bỏ qua, nên **không tự có trên máy người clone**. Mỗi người cấp tài khoản local của mình bằng lệnh trên. Quyền developer chỉ mở bộ điều khiển dịch vụ; sửa code cần quyền truy cập repo và công cụ lập trình. Quyền GitHub và quyền AWS được cấp riêng.

Đăng ký tài khoản sử dụng website ở `/register`. Git không chuyển database, phiên đăng nhập hay tài liệu đã tải lên từ máy này sang máy khác. `.env` và thư mục `tmp/` không nằm trong gói mã nguồn bàn giao.

Đọc theo thứ tự: [README](../README.md) để chạy → [PROJECT_OVERVIEW](PROJECT_OVERVIEW.md) để hiểu hệ thống → [ARCHITECTURE §A10](ARCHITECTURE.md#a10-local-và-aws) để tích hợp cloud → [MILESTONES](MILESTONES.md) để nhận việc và ghi bằng chứng.

## 3. Phân công tiếp theo theo đúng đề xuất PDF

| Thành viên | Việc làm tiếp | Đầu ra để nhóm tích hợp/nghiệm thu |
|---|---|---|
| Trần Anh Việt | VPC, hai AZ, hai public subnet, hai private subnet, routing, security group, ALB; phối hợp Bảo về S3 VPC Endpoint; điều phối tích hợp | Sơ đồ mạng và cấu hình triển khai; ALB truy cập được ứng dụng trên EC2 private; danh sách endpoint/cấu hình bàn giao cho các bạn |
| Trương Công Mạnh | Nắm và kiểm chứng backend hiện có: đăng nhập, upload, tìm kiếm, phân quyền; chuẩn bị chạy ứng dụng trên EC2 với RDS/S3 | Artifact build, cách khởi động ứng dụng, danh sách biến môi trường, bước migration, bằng chứng luồng nghiệp vụ chạy trên AWS |
| Dương Quân Bảo | RDS MySQL, bucket S3 private, EBS và IAM Role cho EC2 theo đề xuất | Endpoint RDS, tên bucket/region, cấu hình quyền và lưu trữ; EC2 truy cập được RDS/S3 bằng cấu hình đã bàn giao; giải thích EBS và S3 dùng cho việc gì |
| Phạm Đức Trọng | Launch template/ASG phối hợp với Việt (sơ đồ đề xuất: hai EC2 ban đầu, tối đa bốn), CloudWatch, alarm, thử tải và cập nhật dự toán | Kịch bản tải, bằng chứng ASG scale-out, alarm đã kích hoạt thử, bảng chi phí theo cấu hình thực tế |

Backend đã có nhiều chức năng; Mạnh tiếp nhận bằng cách đọc, chạy kiểm thử, xử lý các vấn đề tích hợp và giải thích được code. Mỗi thành viên đều có việc triển khai/kỹ thuật và bằng chứng demo như yêu cầu của PDF.

## 4. Thứ tự thực hiện

1. Việt và cả nhóm chạy lại demo local: đăng nhập → upload → tìm kiếm → Public/Private; ghi nhận nghiệm thu M4 local.
2. Chốt cùng nhau các quyết định còn mở: HTTP/HTTPS, cách EC2 private lấy artifact/runtime và truy cập dịch vụ cần thiết, cách cấp bí mật RDS, metric dùng để kích hoạt scale-out. Các mục này đã được ghi ở OD-05/06/07/09 trong [CONTEXT](CONTEXT.md).
3. Việt chuẩn bị mạng/ALB, Bảo chuẩn bị dữ liệu/storage/IAM, Mạnh chuẩn bị bản chạy production và cấu hình tương ứng. Thống nhất tên tài nguyên, region, security group, cổng và endpoint trước khi ghép.
4. Khi ứng dụng chạy ổn qua ALB, Trọng cùng Việt hoàn thiện ASG, alarm và thử tải. Kiểm chứng đăng nhập/upload/download vẫn dùng được khi request qua nhiều instance hoặc thay instance.
5. Từng người lưu cấu hình, ảnh/log và kết quả vào repo theo phần mình; cả nhóm ghép báo cáo, video và diễn tập demo.

Đây là kế hoạch bàn giao; chưa thực hiện tạo tài nguyên AWS. M5 trong tài liệu repo là giai đoạn chuẩn bị AWS, khác với mã mốc thời gian M5 của học phần trong PDF.

## 5. Cách làm chung trên Git

Mỗi việc một nhánh `feature/*`, `fix/*` hoặc `chore/*`. Ví dụ: `feature/aws-network`, `feature/aws-app`, `feature/aws-storage-iam`, `feature/aws-scaling-monitoring`. Các file cấu hình triển khai mới có thể gom trong `deploy/`; hiện chưa có thư mục này.

Mỗi PR ghi việc đã làm, cách chạy, cấu hình cần bàn giao và bằng chứng kiểm tra. PR vào `main` theo quy trình hiện có: `ci-required` đạt và code owner review. Trước khi gửi PR thay đổi ứng dụng, chạy từ gốc repo:

```powershell
npm run lint
npm run build
npm test
```

Kiểm thử local developer và integration/E2E có lệnh riêng trong README. Các thay đổi chỉ về hạ tầng cần thêm kiểm chứng tài nguyên/luồng mạng tương ứng; CI ứng dụng không thay thế việc demo AWS.

## 6. Điều kiện hoàn thành bài tập lớn

Đối chiếu tám hạng mục trong PDF và lưu bằng chứng cho từng mục:

- VPC có public/private subnet trên ít nhất hai AZ.
- Máy chủ ứng dụng ở private subnet, truy cập công khai qua ALB.
- Hai loại lưu trữ EBS và S3, giải thích được lựa chọn.
- RDS MySQL hoạt động cùng ứng dụng.
- EC2 dùng IAM Role, không nhúng access key vào code.
- ALB/ASG hoạt động và quan sát được scale-out khi tăng tải.
- CloudWatch có ít nhất một alarm đã kích hoạt thử.
- Dự toán chi phí tháng theo cấu hình thực tế; bảng khoảng 63,96 USD trong đề xuất là dự toán ban đầu. Ảnh Pricing Calculator cùng trang ghi 56,05 USD, nên Trọng cần đối chiếu lại và thống nhất số liệu.

Kịch bản PDF: 0–2 phút kiến trúc; 2–5 phút nghiệp vụ; 5–7 phút storage/DB/IAM; 7–9 phút tải/ASG/alarm; 9–10 phút chi phí. Thử trước và lưu lịch sử scale-out để trình bày khi khởi tạo instance mất thời gian.

Hạn trong hướng dẫn PDF, trang 3: **09/11/2026** nộp báo cáo cuối, mã nguồn/cấu hình và video demo; **16/11/2026** bảo vệ, vấn đáp. Phân công ở đề xuất là dự kiến ban đầu; nếu nhóm đổi người phụ trách thì cập nhật lại bảng phân công trong báo cáo.
