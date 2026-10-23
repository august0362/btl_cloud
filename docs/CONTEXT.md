# CONTEXT — Hệ thống Lưu trữ và Chia sẻ Tài liệu Học tập

> Tài liệu 1/3 của Design Baseline v1.0: **CÁI GÌ** và **TẠI SAO**. Cách làm: [ARCHITECTURE.md](ARCHITECTURE.md). Công việc và nghiệm thu: [MILESTONES.md](MILESTONES.md).
>
> `BASELINE_VERSION: 1.0` · `DESIGN_STATUS: READY_FOR_OWNER_REVIEW` · `OWNER_APPROVAL: PENDING` · 2026-10-20

**Mục lục:** [C0 Nguồn](#c0-nguồn-và-quy-ước) · [C1 Tổng quan](#c1-tổng-quan) · [C2 Phạm vi](#c2-phạm-vi) · [C3 Tác nhân và quyền](#c3-tác-nhân-và-quyền) · [C4 Yêu cầu chức năng](#c4-yêu-cầu-chức-năng) · [C5 Phi chức năng](#c5-yêu-cầu-phi-chức-năng) · [C6 Giả định, rủi ro, quyết định](#c6-giả-định-ràng-buộc-rủi-ro-quyết-định) · [C7 Scope Freeze](#c7-scope-freeze--requirements-baseline)

---

## C0. Nguồn và quy ước

| # | Nguồn | Vai trò |
|---|---|---|
| S1 | Yêu cầu M0 của owner (2026-10-20) | FR-01…FR-09 và các quy tắc bắt buộc |
| S2 | `C:\Users\admin\Desktop\Đề xuất BTL Cloud Trần Anh Việt 24020362.pdf` | **Baseline nghiệp vụ** (đề xuất đã nộp) |
| S3 | `C:\Users\admin\Downloads\Đề xuất BTL Cloud.docx` | Bản nguồn của S2: sơ đồ kiến trúc (ASG "2 EC2 ban đầu, tối đa 4", S3 qua VPC Endpoint) và ảnh AWS Pricing Calculator |
| S4 | 3 bản nháp docx khác trên Desktop | Khác câu chữ, không đổi phạm vi |
| S5 | `C:\Users\admin\Desktop\Bài tập lớn cuối kỳ - Hướng dẫn đề xuất dự án - Student-1.pdf` | 8 hạng mục bắt buộc, mốc thời gian, tiêu chí từ chối |
| S6 | `README.md`, `.github/` trong repo | Quy trình PR, CI `ci-required`; chưa có mã ứng dụng |
| S7 | Trả lời của owner (2026-10-20) | AWS cá nhân + credits; làm local trước, chưa deploy; HTTPS và egress chốt ở M5 |

Không có tệp tên đúng `BTL Cloud.docx`; S3 là bản gần nhất (DS-02). Các tệp S2–S5 nằm ngoài repo.

**Quy ước ID:** `FR`, `AC`, `BR`, `NFR`, `AS`, `CN`, `RK`, `DS`, `OD` được định nghĩa ở tài liệu này; `D`, `UC`, `API`, `P`, `SEQ`, `CD`, `F`, `U`, `INV` ở ARCHITECTURE; `M<n>-xx` (task) và `ACC` (nghiệm thu) ở MILESTONES.

**Thuật ngữ:** **Guest** = chưa đăng nhập · **User** = đã đăng nhập · **Owner** = User đã tải lên tài liệu đang xét · **metadata** = tiêu đề, mô tả, chế độ hiển thị, tên tệp, kích thước… · **object** = byte của tệp trong object storage.

---

## C1. Tổng quan

**Mục đích.** Website cho học sinh, sinh viên lưu trữ, tìm kiếm và chia sẻ tài liệu học tập (PDF, DOCX, PPTX). Mỗi người có một kho cá nhân. Mỗi tài liệu là **Public** (ai cũng tìm thấy, nhưng phải đăng nhập mới tải được) hoặc **Private** (chỉ chủ sở hữu thấy).

**Bài toán.** Tài liệu nằm rải rác trên máy cá nhân, nhóm chat và nhiều dịch vụ khác nhau, nên khó tìm lại, khó chia sẻ có chọn lọc và dễ mất. Hệ thống giải quyết bằng ba thứ: lưu trữ tập trung, chia sẻ có kiểm soát (Public/Private), và tìm kiếm theo từ khoá. Mọi lượt tải xuống đều gắn với một tài khoản.

**Người dùng.** Guest tìm xem có tài liệu phù hợp không trước khi đăng ký. User tải lên, quản lý kho cá nhân và tải xuống tài liệu.

**Mục tiêu học phần (S5).**
- **CLO4 (80%)** chấm theo 8 hạng mục bắt buộc: (1) mạng riêng có subnet public/private trên ≥ 2 AZ; (2) máy chủ ứng dụng trong private subnet; (3) ≥ 2 loại lưu trữ; (4) một cơ sở dữ liệu; (5) IAM Role, không nhúng access key; (6) cân bằng tải và tự mở rộng, demo được khi tải tăng; (7) giám sát với ≥ 1 alarm được kích hoạt thử; (8) dự toán chi phí tháng.
- **CLO2 (20%)**: phải giải thích được lý do của mọi lựa chọn công nghệ.
- Sản phẩm phải chạy được và demo trong 10 phút. Đề xuất kiểu "một web app đặt trên một máy ảo" sẽ bị từ chối.

**Vì sao cần hạ tầng đám mây:**

| Thành phần | Lý do |
|---|---|
| Object storage dùng chung (S3; local: MinIO) | Tệp tới 50 MB. Tệp tải lên qua instance A phải tải xuống được qua instance B |
| CSDL quan hệ (RDS MySQL; local: MySQL) | Người dùng, phiên, tài liệu, quan hệ sở hữu cần ràng buộc toàn vẹn và truy vấn lọc/phân trang |
| Compute mở rộng ngang (EC2 + ALB + ASG) | Tải dao động theo mùa thi. Ứng dụng stateless nên thêm/bớt instance mà không mất phiên hay dữ liệu |
| Block storage (EBS) | Ổ hệ điều hành và vùng đệm tạm khi nhận tệp upload |

---

## C2. Phạm vi

### C2.1 MVP

| Nhóm | Bao gồm |
|---|---|
| Tài khoản | Đăng ký (email, mật khẩu, tên hiển thị), đăng nhập, đăng xuất; phiên qua cookie |
| Khám phá | Guest/User tìm và duyệt tài liệu Public (từ khoá, loại tệp, sắp xếp, phân trang); xem chi tiết metadata |
| Tải xuống | User tải tài liệu Public của bất kỳ ai và tài liệu Private của mình |
| Tải lên | PDF/DOCX/PPTX ≤ 50 MB; bắt buộc chọn Public/Private |
| Kho cá nhân và quản lý | Danh sách tài liệu của tôi; sửa tiêu đề/mô tả/chế độ; thay tệp (giữ chế độ); xoá vĩnh viễn |
| Vận hành | Health check, log có cấu trúc, nhiều instance dùng chung DB và storage |

### C2.2 Ngoài phạm vi

Mạng xã hội (bình luận, đánh giá, theo dõi, chia sẻ cho người cụ thể, nhóm lớp); tìm kiếm toàn văn, AI search, gợi ý, xem trước tệp; kiểm duyệt tự động, quét virus; trang quản trị, vai trò admin; quên/đổi mật khẩu, xác minh email, SSO, đổi tên hiển thị; xoá tài khoản, thùng rác, lịch sử phiên bản; thống kê, hạn mức dung lượng; app di động, đa ngôn ngữ; OpenStack.

### C2.3 Giai đoạn

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| Local prototype (M1–M4) | Backend + frontend trên máy dev; MySQL và MinIO chạy bằng Docker Compose; thử nhiều instance dùng chung DB/MinIO | Mục tiêu hiện tại |
| Chuẩn bị AWS (M5) | Kế hoạch EC2/ALB/ASG/RDS/S3/IAM/CloudWatch, thử tải, chi phí; chốt HTTPS và egress | Chỉ lập kế hoạch, **không provisioning** |
| Triển khai AWS | Dựng hạ tầng thật, demo 8 hạng mục | Ngoài baseline; cần owner cho phép riêng |

Chuyển từ local lên AWS **chỉ đổi cấu hình**, không đổi kiến trúc hay mã nguồn (NFR-POR-01).

---

## C3. Tác nhân và quyền

### C3.1 Tác nhân

- **Guest**: không có phiên hợp lệ (chưa đăng nhập, đã đăng xuất hoặc phiên hết hạn).
- **User**: có phiên hợp lệ.
- **Owner**: vai trò theo từng tài liệu, khi `users.id = documents.owner_id`; backend kiểm tra ở **mỗi** request. Không có vai trò admin.

### C3.2 Ma trận quyền

✅ được phép · ❌ bị từ chối (mã HTTP; chi tiết ở ARCHITECTURE §A5.5).

| Hành động | Guest | User không phải owner | Owner |
|---|---|---|---|
| Tìm kiếm / xem metadata tài liệu Public | ✅ | ✅ | ✅ |
| Tải xuống tài liệu Public | ❌ 401 | ✅ | ✅ |
| Xem / tải tài liệu Private của **mình** | — | — | ✅ |
| Xem / tải tài liệu Private của **người khác** | ❌ xem 404 · tải 401 | ❌ 404 | — |
| Thấy tài liệu Private trong tìm kiếm công khai | ❌ | ❌ | ❌ (chỉ trong kho cá nhân) |
| Tải lên | ❌ 401 | ✅ (trở thành owner) | ✅ |
| Xem kho cá nhân | ❌ 401 | ✅ (chỉ của mình) | ✅ |
| Sửa metadata / đổi chế độ, thay tệp, xoá | ❌ 401 | ❌ Public 403 · Private 404 | ✅ |

Tài liệu Private của người khác được đối xử **như không tồn tại** (404) để không lộ sự tồn tại của nó. Tài liệu Public vốn đã công khai, nên thao tác trái phép trên nó trả 403 (OD-03).

---

## C4. Yêu cầu chức năng

### C4.0 Quy tắc nghiệp vụ

| ID | Quy tắc |
|---|---|
| BR-01 | Tài liệu Private chỉ owner xem metadata và tải xuống được |
| BR-02 | Chỉ owner được sửa, thay tệp, xoá |
| BR-03 | Guest được tìm và xem metadata tài liệu Public, **không** được tải xuống |
| BR-04 | Khi tải lên phải chọn tường minh Public/Private; không có giá trị mặc định |
| BR-05 | Chỉ PDF, DOCX, PPTX; 1 byte … 50 MB (= 52 428 800 byte, OD-02); loại tệp xác minh theo **nội dung**, không tin phần mở rộng hay MIME client gửi |
| BR-06 | Upload dở dang/thất bại **không bao giờ** xuất hiện ở danh sách, tìm kiếm hay endpoint nào |
| BR-07 | Thay tệp giữ nguyên chế độ hiển thị; thay thất bại thì tệp cũ vẫn còn và tải được |
| BR-08 | Xoá là vĩnh viễn: metadata mất ngay; object bị xoá ngay hoặc qua cơ chế dọn dẹp tự thử lại; không khôi phục |
| BR-09 | Mọi xác thực và phân quyền thực thi ở backend; UI ẩn/hiện nút chỉ để tiện, không có giá trị bảo mật |
| BR-10 | Email là định danh đăng nhập, duy nhất, không phân biệt hoa thường |
| BR-11 | Tìm kiếm công khai chỉ trả tài liệu Public (kể cả tài liệu Public của chính người tìm) |

### FR-01 — Đăng ký, đăng nhập, đăng xuất

| | |
|---|---|
| Mô tả | Đăng ký bằng email + mật khẩu + tên hiển thị; đăng nhập bằng email + mật khẩu; đăng xuất để thu hồi phiên |
| Actor · Tiền điều kiện | Guest (đăng ký, đăng nhập); User (đăng xuất, idempotent) · Không cần phiên |
| Kết quả | Đăng ký xong **tự đăng nhập** (OD-04); đăng nhập tạo phiên mới (cookie HttpOnly); đăng xuất xoá phiên phía server và xoá cookie |
| Quy tắc | BR-10. Email ≤ 254 ký tự, được trim và chuyển chữ thường; mật khẩu 8–128 ký tự; tên hiển thị 1–100 ký tự; phiên hết hạn sau 7 ngày (OD-12); mật khẩu chỉ lưu dạng băm |
| Lỗi | Email đã dùng → lỗi tại trường Email. Sai email hoặc mật khẩu → **một** thông báo chung. Dữ liệu sai → lỗi theo trường. Gửi quá nhiều → báo thử lại sau |
| Tiêu chí chấp nhận | **AC-01.1** Đăng ký hợp lệ → vào "Tài liệu của tôi", header hiện tên. **AC-01.2** Đăng ký trùng email (khác hoa thường) → "Email đã được sử dụng". **AC-01.3** Sai mật khẩu và email không tồn tại → cùng một thông báo. **AC-01.4** Sau đăng xuất, cookie cũ gọi API cần đăng nhập → 401. **AC-01.5** `document.cookie` không chứa cookie phiên; localStorage không có token. **AC-01.6** DB không lưu mật khẩu dạng rõ |

### FR-02 — Guest tìm kiếm và duyệt tài liệu Public

| | |
|---|---|
| Mô tả | Tìm tài liệu Public theo từ khoá trong tiêu đề/mô tả, lọc loại tệp, sắp xếp, phân trang; xem trang chi tiết metadata |
| Actor · Tiền điều kiện | Guest, User · Không |
| Kết quả | Danh sách tài liệu Public (tiêu đề, mô tả, loại, kích thước, tên người đăng, ngày đăng) kèm tổng số và phân trang |
| Quy tắc | BR-03, BR-06, BR-11. Từ khoá ≤ 100 ký tự, khớp chuỗi con, không phân biệt hoa thường và dấu theo collation MySQL ("đ"/"d" cần kiểm chứng, RK-08); `%` và `_` hiểu theo nghĩa đen; mặc định mới nhất trước; 12 mục/trang (tối đa 50); không bao giờ lộ email người đăng |
| Lỗi | Không có kết quả → trạng thái rỗng. Lỗi mạng/máy chủ → thông báo + nút thử lại. Tham số sai → 400 |
| Tiêu chí chấp nhận | **AC-02.1** Guest tìm được tài liệu Public theo một từ trong tiêu đề. **AC-02.2** Tài liệu Private không bao giờ xuất hiện trong tìm kiếm của bất kỳ ai. **AC-02.3** Tìm "%" không trả về toàn bộ danh sách. **AC-02.4** Guest mở được chi tiết tài liệu Public; chi tiết tài liệu Private của người khác → "Không tìm thấy tài liệu". **AC-02.5** Phân trang đúng tổng số; URL giữ từ khoá và trang (tải lại trang không mất kết quả) |

### FR-03 — Bắt buộc đăng nhập để tải xuống

| | |
|---|---|
| Mô tả | Tải xuống cần phiên hợp lệ. User tải được mọi tài liệu Public và tài liệu Private của mình |
| Actor · Tiền điều kiện | User · Có quyền xem tài liệu (BR-01) |
| Kết quả | Tệp tải về đúng tên gốc (kể cả tiếng Việt), đúng nội dung từng byte |
| Quy tắc | BR-01, BR-03, BR-09. Tệp chỉ phục vụ qua backend; storage không bao giờ public, không phát hành URL công khai |
| Lỗi | Guest → chuyển tới đăng nhập rồi quay lại. Private của người khác / không tồn tại → 404. Storage lỗi → báo tạm thời không tải được |
| Tiêu chí chấp nhận | **AC-03.1** Guest bấm "Đăng nhập để tải xuống" → đăng nhập xong quay lại đúng trang. **AC-03.2** Gọi URL tải xuống khi chưa đăng nhập → 401. **AC-03.3** Checksum tệp tải về trùng tệp gốc. **AC-03.4** User B tải tài liệu Private của A → 404. **AC-03.5** Không URL storage nào truy cập được nếu không qua backend |

### FR-04 — Tải lên PDF/DOCX/PPTX tối đa 50 MB

| | |
|---|---|
| Mô tả | Tải lên một tệp kèm tiêu đề, mô tả (tuỳ chọn), chế độ hiển thị |
| Actor · Tiền điều kiện | User · Có phiên |
| Kết quả | Tài liệu có trong kho cá nhân; nếu Public thì có trong tìm kiếm; người tải lên là owner |
| Quy tắc | BR-04, BR-05, BR-06. Tiêu đề 1–200 ký tự, không xuống dòng (UI tự điền từ tên tệp); mô tả ≤ 2000 ký tự; có thanh tiến độ và nút huỷ |
| Lỗi | > 50 MB → 413; sai định dạng hoặc giả đuôi (ví dụ `.exe` đổi thành `.pdf`) → 415; tệp rỗng hoặc thiếu chế độ → lỗi theo trường; storage lỗi hoặc huỷ giữa chừng → không có tài liệu nào được tạo |
| Tiêu chí chấp nhận | **AC-04.1** Tải lên được mỗi loại PDF, DOCX, PPTX. **AC-04.2** 52 428 800 byte được chấp nhận; 52 428 801 byte bị từ chối. **AC-04.3** Tệp văn bản đổi đuôi `.pdf` bị từ chối. **AC-04.4** Storage ngừng → upload lỗi và không có tài liệu "ma". **AC-04.5** Tên tệp tiếng Việt giữ đúng |

### FR-05 — Chọn tường minh Public/Private khi tải lên

| | |
|---|---|
| Mô tả | Form upload bắt buộc chọn một trong hai chế độ; không chọn sẵn |
| Actor · Tiền điều kiện | User · Đang ở form tải lên |
| Kết quả | Tài liệu lưu đúng chế độ đã chọn |
| Quy tắc | BR-04. Backend từ chối request thiếu `visibility`; mỗi lựa chọn có mô tả hệ quả |
| Lỗi | Chưa chọn → nút gửi bị khoá / lỗi tại trường. API thiếu trường → 400 |
| Tiêu chí chấp nhận | **AC-05.1** Mở form: không radio nào được chọn. **AC-05.2** API upload thiếu `visibility` → 400 `VALIDATION_ERROR`. **AC-05.3** Private không xuất hiện trong tìm kiếm công khai; Public thì có |

### FR-06 — Kho tài liệu cá nhân

| | |
|---|---|
| Mô tả | Xem mọi tài liệu của mình (Public và Private), tìm, lọc theo chế độ/loại, phân trang; từ đây tải xuống, sửa, xoá |
| Actor · Tiền điều kiện | User · Có phiên |
| Kết quả | Chỉ gồm tài liệu có `owner_id` là User hiện tại, có nhãn Public/Private |
| Quy tắc | BR-01, BR-06 |
| Lỗi | Chưa đăng nhập → tới trang đăng nhập. Kho rỗng → trạng thái rỗng + nút "Tải lên tài liệu đầu tiên" |
| Tiêu chí chấp nhận | **AC-06.1** User A và B mỗi người chỉ thấy tài liệu của mình. **AC-06.2** Lọc "Riêng tư" chỉ hiện tài liệu Private. **AC-06.3** Vào `/me/documents` khi chưa đăng nhập → tới trang đăng nhập |

### FR-07 — Sửa tiêu đề, mô tả, chế độ hiển thị

| | |
|---|---|
| Mô tả | Owner đổi một hoặc nhiều trường metadata; đổi chế độ có hiệu lực ngay với tìm kiếm và tải xuống |
| Actor · Tiền điều kiện | Owner · Tài liệu tồn tại |
| Kết quả | Metadata mới được lưu, `updatedAt` đổi; nội dung tệp không đổi |
| Quy tắc | BR-02, BR-09; ràng buộc trường như FR-04; Private → Public phải qua hộp thoại xác nhận |
| Lỗi | Không phải owner → 403/404 (C3.2); dữ liệu sai → lỗi theo trường; tài liệu đã bị xoá → 404 |
| Tiêu chí chấp nhận | **AC-07.1** Đổi tiêu đề → tìm theo tiêu đề mới thấy. **AC-07.2** Public → Private: biến mất khỏi tìm kiếm ngay; User khác tải → 404. **AC-07.3** User khác sửa tài liệu Public → 403; Private → 404 |

### FR-08 — Thay thế tệp, giữ nguyên chế độ hiển thị

| | |
|---|---|
| Mô tả | Owner thay tệp hiện tại bằng tệp mới (có thể khác loại); `id`, tiêu đề, mô tả, chế độ giữ nguyên |
| Actor · Tiền điều kiện | Owner · Tệp mới thoả BR-05 |
| Kết quả | Tải xuống trả tệp mới; `fileVersion` + 1; tệp cũ bị dọn sau ân hạn ngắn (D-09) |
| Quy tắc | BR-05, BR-07; tệp mới có object key mới |
| Lỗi | Tệp mới không hợp lệ, storage lỗi hoặc DB lỗi → báo lỗi, vẫn trỏ tệp cũ. Hai lần thay đồng thời → một lần thành công, lần kia 409 |
| Tiêu chí chấp nhận | **AC-08.1** Sau khi thay, tải xuống ra nội dung mới; tiêu đề và chế độ không đổi. **AC-08.2** Storage ngừng giữa lúc thay → báo lỗi, tải xuống vẫn ra nội dung cũ. **AC-08.3** Sau ân hạn, object cũ không còn trong bucket |

### FR-09 — Xoá vĩnh viễn tài liệu của mình

| | |
|---|---|
| Mô tả | Owner xoá sau khi xác nhận; metadata và tệp bị xoá vĩnh viễn |
| Actor · Tiền điều kiện | Owner · Tài liệu tồn tại |
| Kết quả | Tài liệu biến mất ngay khỏi mọi danh sách và endpoint (404); object bị xoá khỏi storage |
| Quy tắc | BR-02, BR-08; hộp thoại xác nhận nêu rõ "không thể hoàn tác" |
| Lỗi | Không phải owner → 403/404. Storage lỗi khi xoá object → vẫn báo thành công (metadata đã xoá), hệ thống tự thử xoá object lại |
| Tiêu chí chấp nhận | **AC-09.1** Sau khi xoá, chi tiết/tải xuống → 404 với mọi người. **AC-09.2** Object không còn trong bucket (ngay, hoặc sau khi storage hoạt động lại). **AC-09.3** Bấm "Huỷ" ở hộp thoại → không có gì thay đổi |

---

## C5. Yêu cầu phi chức năng

**M** = bắt buộc (có trong S1/S2/S5) · **P** = mục tiêu do thiết kế đề xuất. Không có con số hiệu năng nào được bịa ra; mọi số liệu tải sẽ đo ở M5.

| ID | Yêu cầu | Loại | Kiểm chứng |
|---|---|---|---|
| NFR-SEC-01 | Mọi thao tác cần quyền được kiểm tra ở backend theo C3.2 | M | Test gọi API trực tiếp |
| NFR-SEC-02 | Mật khẩu băm argon2id; không trả về, không ghi log | P | Kiểm tra DB và log |
| NFR-SEC-03 | Phiên opaque trong cookie HttpOnly; DB chỉ lưu hash; không token trong localStorage | P | Test + DevTools |
| NFR-SEC-04 | Chống CSRF cho request thay đổi trạng thái | P | Thiếu header / Origin lạ → 403 |
| NFR-SEC-05 | Không access key AWS trong mã; dùng IAM Role trên AWS | M (S5 #5) | Rà soát repo, M5 |
| NFR-SEC-06 | Bucket private; tải xuống qua backend sau khi kiểm quyền | P | Truy cập object trực tiếp bị từ chối |
| NFR-SEC-07 | Kiểm loại tệp theo nội dung; object key không chứa dữ liệu người dùng | P | Test tệp giả |
| NFR-SEC-08 | Production dùng HTTPS và cookie `Secure` | P (OD-05) | Chốt ở M5 |
| NFR-SEC-09 | Header bảo mật (CSP, `nosniff`…) | P | Test header |
| NFR-AVL-01 | Tầng ứng dụng ≥ 2 instance trên 2 AZ sau ALB; RDS Single-AZ là điểm lỗi đơn được chấp nhận (DS-07) | M (S2) | M5 |
| NFR-AVL-02 | Health liveness không phụ thuộc DB/storage | P | `/api/health` vẫn 200 khi DB dừng |
| NFR-REL-01 | Upload dở dang/thất bại không bao giờ hiển thị (BR-06) | M | Test lỗi storage |
| NFR-REL-02 | Thay thế thất bại giữ tệp cũ (BR-07) | M | Test lỗi storage |
| NFR-REL-03 | Object mồ côi được dọn tự động, có thử lại | P | Test worker |
| NFR-REL-04 | Tắt êm khi nhận SIGTERM | P | Thử ở M4 |
| NFR-SCL-01 | Nhiều instance dùng chung DB và storage; không trạng thái cục bộ ảnh hưởng tính đúng | M (S1) | 2 instance local (M4) |
| NFR-SCL-02 | ASG mở rộng khi tải tăng, demo được | M (S5 #6) | Kế hoạch thử tải M5 |
| NFR-SCL-03 | Upload không đệm toàn bộ tệp trong RAM | P | Rà soát + test |
| NFR-CON-01 | MySQL là nguồn sự thật; object không được tham chiếu cuối cùng sẽ bị xoá | P | Test |
| NFR-CON-02 | Thay/xoá đồng thời không làm mất dấu object | P | Test đồng thời |
| NFR-MNT-01 | TypeScript strict; modular monolith; lint trong CI | P | CI |
| NFR-MNT-02 | Hợp đồng API duy nhất tại ARCHITECTURE §A7 | P | Contract test |
| NFR-MNT-03 | Có unit, integration, E2E test cho luồng chính | P | M2–M4 |
| NFR-USA-01 | UI tiếng Việt; lỗi rõ ràng; dùng được từ 360 px; hướng tới WCAG 2.1 AA (mục tiêu, không phải chứng nhận) | P | M3/M4 |
| NFR-USA-02 | Upload có tiến độ và huỷ được | P | Test UI |
| NFR-OBS-01 | CloudWatch có ≥ 1 alarm được kích hoạt thử | M (S5 #7) | M5 |
| NFR-OBS-02 | Log JSON có `requestId`, `instanceId`; không ghi mật khẩu/cookie/token | P | Test log |
| NFR-OBS-03 | Health trả `instanceId` để minh hoạ cân bằng tải | P | Test |
| NFR-POR-01 | Local → AWS chỉ đổi cấu hình (MySQL→RDS, MinIO→S3, credentials→IAM Role) | M (S1) | Rà soát M5 |
| NFR-POR-02 | Cấu hình qua biến môi trường, kiểm tra khi khởi động | P | Test config |
| NFR-CST-01 | Có dự toán chi phí tháng theo kiến trúc cuối | M (S5 #8) | M5 |

---

## C6. Giả định, ràng buộc, rủi ro, quyết định

### C6.1 Ràng buộc tệp và xác thực

| ID | Ràng buộc |
|---|---|
| CN-01 | PDF (`application/pdf`), DOCX (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`), PPTX (`application/vnd.openxmlformats-officedocument.presentationml.presentation`). Không hỗ trợ DOC/PPT đời cũ, Office có mật khẩu, tệp nén |
| CN-02 | "50 MB" = **52 428 800 byte** (50 × 1024²), khớp cách hệ điều hành hiển thị (OD-02) |
| CN-03 | Mỗi request upload đúng 1 tệp |
| CN-04 | Không quét virus, không kiểm duyệt nội dung |

Xác thực: một mô hình duy nhất là **phiên lưu DB + cookie HttpOnly**, không JWT, không token trong JavaScript. Frontend và API luôn cùng origin (Vite proxy khi dev, ALB khi production), không bật CORS. Phân quyền theo sở hữu, kiểm tra ở mỗi request.

### C6.2 Thời gian và ngân sách

| Mốc học phần (S5) | Hạn (đọc từ bảng bị vỡ định dạng, cần owner xác nhận, AS-06) |
|---|---|
| HP-M1 Chốt nhóm · HP-M2 Nộp đề xuất | 19/10/2026 |
| HP-M3 Giảng viên duyệt | 21/10/2026 |
| HP-M4 Nộp báo cáo, mã nguồn, video | **09/11/2026** |
| HP-M5 Bảo vệ, vấn đáp | 16/11/2026 |

Kế hoạch S2 kéo dài 3 tuần, nhóm 4 người. Phân công con người trong S2 giữ nguyên (Việt: VPC, ALB, tích hợp; Mạnh: backend; Bảo: RDS, S3, EBS, IAM; Trọng: ASG, CloudWatch, thử tải, dự toán); vai trò agent trong MILESTONES chỉ là vai trò thực thi. S2 dự toán ~63,96 USD/tháng trước credits (DS-03). Mỗi thành viên phải giải thích được phần mình và kiến trúc tổng thể, nên baseline ưu tiên giải pháp đơn giản.

### C6.3 Giả định

| ID | Giả định |
|---|---|
| AS-01 | Máy dev: Windows 11 + WSL2 (Ubuntu 22.04), Node.js 24 LTS (đang có v24.19.0), npm 11, Git |
| AS-02 | Docker **chưa cài**; owner cài Docker Desktop trước M1 (M1-00; phương án khác: OD-14) |
| AS-03 | Trình duyệt: Chrome, Edge, Firefox bản hiện hành trên desktop và di động |
| AS-04 | Quy mô demo: vài chục người dùng, vài trăm tài liệu; `LIKE` là đủ, chưa cần full-text |
| AS-05 | Tài khoản AWS cá nhân có credits, đủ quyền tạo IAM/VPC/ALB/ASG/RDS/S3/CloudWatch; region `us-east-1` |
| AS-06 | Cách đọc mốc thời gian ở C6.2 là đúng |
| AS-07 | Không có yêu cầu pháp lý đặc thù; người tải lên chịu trách nhiệm nội dung |

Bất định về cloud: chưa kiểm tra hạn mức (quota) của tài khoản (M5-09); credits có thể có hạn dùng (theo dõi bằng AWS Budgets); HTTPS (OD-05) và egress (OD-06) chưa chốt nhưng không chặn M1–M4.

### C6.4 Rủi ro

| ID | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| RK-01 | DB và storage không có transaction chung → object mồ côi hoặc metadata trỏ tới object không có | Cao | Guard + `storage_cleanup_tasks` + worker (ARCHITECTURE §A6) |
| RK-02 | Sai phân quyền làm lộ tài liệu Private (S2 đã nêu) | Cao | Policy tập trung một chỗ; test tự động ma trận C3.2 |
| RK-03 | Tệp lớn qua ALB/Node bị timeout | TB | Timeout ở ARCHITECTURE §A10.4; thử ở M5 |
| RK-04 | Không có HTTPS làm cookie phiên đi qua kênh không mã hoá | TB | OD-05; nếu không có HTTPS thì ghi là rủi ro được chấp nhận cho demo |
| RK-05 | Ứng dụng chủ yếu chờ I/O, CPU khó tăng, khó kích hoạt ASG khi demo | TB | Chọn metric phù hợp + thử tải trước (OD-09) |
| RK-06 | Có thông tin (cuối 2025) rằng MinIO ngừng phát hành image miễn phí | TB | Ghim tag image còn tồn tại; adapter chỉ dùng S3 API nên thay được bằng emulator khác |
| RK-07 | Hai agent làm song song tạo hợp đồng lệch nhau | TB | §A7 là nguồn sự thật duy nhất; contract test hai phía |
| RK-08 | Collation có thể không coi "đ" ≡ "d" | Thấp | Kiểm chứng ở M2-08, ghi là hạn chế nếu có |
| RK-09 | Tên tệp UTF-8 bị giải mã sai (latin1) khi parse multipart | Thấp | Test bắt buộc với tên tiếng Việt (M2-06) |
| RK-10 | Rate limit trong bộ nhớ chỉ áp dụng theo từng instance | Thấp | Chấp nhận cho MVP |
| RK-11 | Phát sinh chi phí AWS ngoài dự toán (NAT, endpoint, tên miền, t3 unlimited) | TB | Rà soát chi phí M5-09 trước khi provisioning |

### C6.5 Sai lệch giữa các nguồn

| ID | Sai lệch | Xử lý |
|---|---|---|
| DS-01 | S2 chỉ ghi "quản lý kho cá nhân"; S1 chi tiết thành FR-07/08/09 và thêm đăng xuất | Coi là chi tiết hoá, đưa vào MVP |
| DS-02 | Không có `BTL Cloud.docx`; có 4 bản docx khác nhau | S2 (PDF đã nộp) là chuẩn; S3 bổ sung sơ đồ |
| DS-03 | Bảng chi phí S2 63,96 USD; ảnh Pricing Calculator 56,05 USD (thiếu Public IPv4, CloudWatch; EC2 lệch 15,18 / 18,38) | Đối chiếu lại ở M5-09 |
| DS-04 | Sơ đồ có VPC Endpoint cho S3 nhưng phần chữ và chi phí không nhắc; không có NAT; dòng "Public IPv4 × 2" mâu thuẫn với EC2 private (nhiều khả năng là IP của ALB) | OD-06, làm rõ ở M5 |
| DS-05 | "50 MB" có thể là 50 000 000 hoặc 52 428 800 byte | Chọn 52 428 800 (OD-02) |
| DS-06 | Kế hoạch S2 3 tuần; S5 cho hạn nộp ~09/11/2026 | Lịch MILESTONES theo mốc này |
| DS-07 | Kiến trúc 2 AZ nhưng RDS Single-AZ | Giữ Single-AZ theo S2 vì chi phí; ghi là điểm lỗi đơn |
| DS-08 | S5 yêu cầu demo khi tải tăng; S2 không nêu metric scaling | OD-09, M5-08 |
| DS-09 | S2/S3 không nói HTTP hay HTTPS | OD-05 |

### C6.6 Quyết định cần owner xem xét

Baseline được viết theo **đề xuất mặc định** cho tới khi owner quyết định khác.

| ID | Câu hỏi | Đề xuất mặc định | Chặn |
|---|---|---|---|
| OD-01 | Stack React + TS + Vite / Node 24 + Express 5 + Prisma / MySQL 8.4 / MinIO / Docker Compose? | Chấp nhận (ARCHITECTURE §A1) | M1, M3 |
| OD-02 | 50 MB = 52 428 800 byte? | Có | — |
| OD-03 | Private của người khác → 404; thao tác trái phép trên Public → 403? | Có | — |
| OD-04 | Đăng ký xong tự đăng nhập; báo "email đã được sử dụng"? | Có | — |
| OD-05 | Production dùng HTTPS (tên miền + ACM) hay HTTP qua DNS của ALB? | **Quyết định ở M5**; thiết kế hỗ trợ cả hai | M5 |
| OD-06 | Egress cho EC2 private: chỉ S3 Gateway Endpoint / thêm Interface Endpoint / NAT? | **Quyết định ở M5** | M5 |
| OD-07 | Cách cấp mật khẩu RDS cho EC2 (SSM Parameter Store, user data…)? | Quyết định ở M5 cùng OD-06 | M5 |
| OD-08 | Sửa `.github/workflows/ci.yml` (owner bảo vệ) để chạy integration test? | Đề xuất ở M1-11; owner duyệt PR | — |
| OD-09 | Metric ASG cho demo: CPU hay `ALBRequestCountPerTarget`? | Quyết định ở M5 sau thử tải | M5 |
| OD-10 | Giữ trang chi tiết tài liệu (P-04) và bộ lọc loại tệp? | Giữ (rẻ, hỗ trợ chia sẻ bằng link) | — |
| OD-11 | Ân hạn 120 s trước khi xoá object cũ sau thay thế? | Có | — |
| OD-12 | Phiên cố định 7 ngày, không gia hạn trượt? | Có | — |
| OD-13 | Node.js 24 LTS cho dev, CI (`lts/*`) và EC2? | Có | M1 |
| OD-14 | Local dùng Docker Desktop hay cài MySQL/MinIO trực tiếp? | Docker Desktop (đơn giản, tái lập được) | M1 |

---

## C7. Scope Freeze / Requirements Baseline

```text
REQUIREMENTS_BASELINE: 1.0
FUNCTIONAL:      FR-01 … FR-09 (C4), BR-01 … BR-11
NON-FUNCTIONAL:  C5 (M = bắt buộc, P = mục tiêu đề xuất)
ACTORS:          Guest, User (Owner là vai trò theo từng tài liệu)
OUT OF SCOPE:    C2.2
OPEN DECISIONS:  OD-01 … OD-14 (C6.6). OD-05, OD-06, OD-07, OD-09 chuyển sang M5
STATUS:          PROPOSED — chờ owner duyệt (MILESTONES › OWNER DESIGN APPROVAL)
```

Sau khi owner duyệt, mọi thay đổi phạm vi phải ghi vào **Nhật ký thay đổi baseline** (MILESTONES) và được owner chấp thuận trước khi triển khai.
