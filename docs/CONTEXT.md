# CONTEXT — Hệ thống Lưu trữ và Chia sẻ Tài liệu Học tập

> Tài liệu 1/3 của Design Baseline v1.0: **CÁI GÌ** và **TẠI SAO**. Cách làm: [ARCHITECTURE.md](ARCHITECTURE.md). Công việc và nghiệm thu: [MILESTONES.md](MILESTONES.md).
>
> `BASELINE_VERSION: 1.0` · `DESIGN_STATUS: APPROVED` · `OWNER_APPROVAL: APPROVED` (MILESTONES › OWNER DESIGN APPROVAL) · 2026-10-20 · cập nhật theo CR-001…CR-008

**Mục lục:** [C0 Nguồn](#c0-nguồn-và-quy-ước) · [C1 Tổng quan](#c1-tổng-quan) · [C2 Phạm vi](#c2-phạm-vi) · [C3 Tác nhân và quyền](#c3-tác-nhân-và-quyền) · [C4 Yêu cầu chức năng](#c4-yêu-cầu-chức-năng) · [C5 Phi chức năng](#c5-yêu-cầu-phi-chức-năng) · [C6 Giả định, rủi ro, quyết định](#c6-giả-định-ràng-buộc-rủi-ro-quyết-định) · [C7 Scope Freeze](#c7-scope-freeze--requirements-baseline) · [C8 Mở rộng đề xuất E1–E8 (PROPOSED)](#c8-mở-rộng-đề-xuất-e1e8)

## C0. Nguồn và quy ước

| # | Nguồn | Vai trò |
|---|---|---|
| S1 | Yêu cầu M0 của owner (20/10/2026) | FR-01…09 và quy tắc bắt buộc |
| S2 | `pdf/Đề xuất BTL Cloud Trần Anh Việt 24020362.pdf` | Baseline nghiệp vụ, kiến trúc và phân công đã nộp |
| S3/S4 | Bản nguồn và các nháp Word trước đây | Lịch sử đối chiếu; sơ đồ ASG 2–4 EC2, S3 Endpoint và ảnh dự toán |
| S5 | `pdf/Bài tập lớn cuối kỳ - Hướng dẫn.pdf` | Tám hạng mục, mốc thời gian và cách chấm |
| S6 | README, mã nguồn và .github trong repo | Cách chạy, hợp đồng thực tế, PR/CI |
| S7 | Owner chốt ngày 20/10/2026 | AWS cá nhân/credits; làm local trước; HTTPS/egress quyết định ở M5 |

Thư mục pdf không theo Git, nhóm chia sẻ riêng. Các sai lệch lịch sử còn cần xử lý được giữ ở §C6.5.

**Quy ước:** FR/AC/BR/NFR là chức năng/tiêu chí/quy tắc/phi chức năng; CN/AS/RK/DS/OD là ràng buộc/giả định/rủi ro/sai lệch/quyết định trong tài liệu này. D/UC/API/P/SEQ/CD/F/U/INV ở ARCHITECTURE; task M<n>-xx và nghiệm thu ACC ở MILESTONES. Phần mở rộng đề xuất dùng ID riêng (`E<n>-FR`, `E<n>-AC`, `XBR`, `XOD`), xem §C8.0.

**Thuật ngữ:** Guest chưa đăng nhập; User đã đăng nhập; Owner sở hữu tài liệu đang xét; metadata là thông tin tài liệu, object là byte tệp trong storage.

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
| Object storage dùng chung (S3; local: SeaweedFS, CR-001) | Tệp tới 50 MB. Tệp tải lên qua instance A phải tải xuống được qua instance B |
| CSDL quan hệ (RDS MySQL; local: MySQL) | Người dùng, phiên, tài liệu, quan hệ sở hữu cần ràng buộc toàn vẹn và truy vấn lọc/phân trang |
| Compute mở rộng ngang (EC2 + ALB + ASG) | Tải dao động theo mùa thi. Ứng dụng stateless nên thêm/bớt instance mà không mất phiên hay dữ liệu |
| Block storage (EBS) | Ổ hệ điều hành và vùng đệm tạm khi nhận tệp upload |

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

Một số mục trên (quản trị local, xoá tài khoản, thống kê, hồ sơ, đổi tên hiển thị, bạn bè) được **đề xuất** lại ở §C8. Theo CR-009 (owner 30/10/2026): quản trị local, xoá tài khoản, thống kê (E1–E3) được đưa vào phạm vi mở rộng; hồ sơ, đổi tên hiển thị, bạn bè (E4–E5) vẫn ngoài phạm vi vì đang hoãn.

### C2.3 Giai đoạn

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| Local prototype (M1–M4) | Backend + frontend trên máy dev; MySQL và SeaweedFS chạy bằng Docker Compose hoặc `run.bat` (CR-004); thử nhiều instance dùng chung DB/storage | Mục tiêu hiện tại |
| Chuẩn bị AWS (M5) | Kế hoạch EC2/ALB/ASG/RDS/S3/IAM/CloudWatch, thử tải, chi phí; chốt HTTPS và egress | Chỉ lập kế hoạch, **không provisioning** |
| Triển khai AWS | Dựng hạ tầng thật, demo 8 hạng mục | Ngoài baseline; cần owner cho phép riêng |

Chuyển từ local lên AWS **chỉ đổi cấu hình**, không đổi kiến trúc hay mã nguồn (NFR-POR-01).

## C3. Tác nhân và quyền

### C3.1 Tác nhân

- **Guest**: không có phiên hợp lệ (chưa đăng nhập, đã đăng xuất hoặc phiên hết hạn).
- **User**: có phiên hợp lệ.
- **Owner**: vai trò theo từng tài liệu, khi `users.id = documents.owner_id`; backend kiểm tra ở **mỗi** request. Không có vai trò admin.
- **Developer** (ngoài website): tài khoản công cụ local (ARCHITECTURE §A5.9), không phải bản ghi `users`. Quyền admin local cho developer được thêm ở §C8 (CR-009).

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
| BR-08 | Xoá là vĩnh viễn: metadata mất ngay; object bị thử xoá ngay (best-effort, lỗi ghi log `storage.orphan`, CR-007); không khôi phục |
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
| Kết quả | Tải xuống trả tệp mới; `fileVersion` + 1; thử xoá object cũ ngay sau khi cập nhật DB (D-09) |
| Quy tắc | BR-05, BR-07; tệp mới có object key mới |
| Lỗi | Tệp mới không hợp lệ, storage lỗi hoặc DB lỗi → báo lỗi, vẫn trỏ tệp cũ. Hai lần thay đồng thời → cả hai có thể thành công, lần ghi sau thắng (D-08, không 409) |
| Tiêu chí chấp nhận | **AC-08.1** Sau khi thay, tải xuống ra nội dung mới; tiêu đề và chế độ không đổi. **AC-08.2** Storage ngừng giữa lúc thay → báo lỗi, tải xuống vẫn ra nội dung cũ. **AC-08.3** Sau khi thay thành công, object cũ không còn trong bucket (trừ khi DeleteObject lỗi → log `storage.orphan`) |

### FR-09 — Xoá vĩnh viễn tài liệu của mình

| | |
|---|---|
| Mô tả | Owner xoá sau khi xác nhận; metadata và tệp bị xoá vĩnh viễn |
| Actor · Tiền điều kiện | Owner · Tài liệu tồn tại |
| Kết quả | Tài liệu biến mất ngay khỏi mọi danh sách và endpoint (404); object bị xoá khỏi storage |
| Quy tắc | BR-02, BR-08; hộp thoại xác nhận nêu rõ "không thể hoàn tác" |
| Lỗi | Không phải owner → 403/404. Storage lỗi khi xoá object → vẫn báo thành công (metadata đã xoá); object có thể còn lại, log WARN `storage.orphan` để xử lý thủ công |
| Tiêu chí chấp nhận | **AC-09.1** Sau khi xoá, chi tiết/tải xuống → 404 với mọi người. **AC-09.2** Object không còn trong bucket khi storage hoạt động; nếu DeleteObject lỗi thì có log `storage.orphan` chứa key. **AC-09.3** Bấm "Huỷ" ở hộp thoại → không có gì thay đổi |

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
| NFR-REL-03 | Lỗi xoá object được ghi log WARN `storage.orphan` kèm key; không dọn tự động (CR-007) | P | Test lỗi storage |
| NFR-REL-04 | Tắt êm khi nhận SIGTERM | P | Thử ở M4 |
| NFR-SCL-01 | Nhiều instance dùng chung DB và storage; không trạng thái cục bộ ảnh hưởng tính đúng | M (S1) | 2 instance local (M4) |
| NFR-SCL-02 | ASG mở rộng khi tải tăng, demo được | M (S5 #6) | Kế hoạch thử tải M5 |
| NFR-SCL-03 | Upload không đệm toàn bộ tệp trong RAM | P | Rà soát + test |
| NFR-CON-01 | MySQL là nguồn sự thật; object không còn được tham chiếu được thử xoá một lần (best-effort, CR-007) | P | Test |
| NFR-CON-02 | Thay/xoá đồng thời không làm tài liệu trỏ tới object không tồn tại; object của lần thay bị ghi đè có thể mồ côi (last write wins, CR-007) | P | Test đồng thời |
| NFR-MNT-01 | TypeScript strict; modular monolith; lint trong CI | P | CI |
| NFR-MNT-02 | Hợp đồng API duy nhất tại ARCHITECTURE §A7 | P | Contract test |
| NFR-MNT-03 | Có unit, integration, E2E test cho luồng chính | P | M2–M4 |
| NFR-USA-01 | UI tiếng Việt; lỗi rõ ràng; dùng được từ 360 px; hướng tới WCAG 2.1 AA (mục tiêu, không phải chứng nhận) | P | M3/M4 |
| NFR-USA-02 | Upload có tiến độ và huỷ được | P | Test UI |
| NFR-OBS-01 | CloudWatch có ≥ 1 alarm được kích hoạt thử | M (S5 #7) | M5 |
| NFR-OBS-02 | Log JSON có `requestId`, `instanceId`; không ghi mật khẩu/cookie/token | P | Test log |
| NFR-OBS-03 | Health trả `instanceId` để minh hoạ cân bằng tải | P | Test |
| NFR-POR-01 | Local → AWS chỉ đổi cấu hình (MySQL→RDS, SeaweedFS→S3, credentials→IAM Role) | M (S1) | Rà soát M5 |
| NFR-POR-02 | Cấu hình qua biến môi trường, kiểm tra khi khởi động | P | Test config |
| NFR-CST-01 | Có dự toán chi phí tháng theo kiến trúc cuối | M (S5 #8) | M5 |

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

| Mốc học phần (S5) | Hạn (đã đối chiếu PDF S5, trang 3) |
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
| AS-02 | Docker là tuỳ chọn: chạy bằng Docker Desktop hoặc `run.bat` tải MySQL/SeaweedFS portable (CR-004, OD-14) |
| AS-03 | Trình duyệt: Chrome, Edge, Firefox bản hiện hành trên desktop và di động |
| AS-04 | Quy mô demo: vài chục người dùng, vài trăm tài liệu; `LIKE` là đủ, chưa cần full-text |
| AS-05 | Tài khoản AWS cá nhân có credits, đủ quyền tạo IAM/VPC/ALB/ASG/RDS/S3/CloudWatch; region `us-east-1` |
| AS-06 | Mốc thời gian ở C6.2 được đối chiếu trực tiếp với PDF S5, trang 3 |
| AS-07 | Không có yêu cầu pháp lý đặc thù; người tải lên chịu trách nhiệm nội dung |

Bất định về cloud: chưa kiểm tra hạn mức (quota) của tài khoản (M5-09); credits có thể có hạn dùng (theo dõi bằng AWS Budgets); HTTPS (OD-05) và egress (OD-06) chưa chốt nhưng không chặn M1–M4.

### C6.4 Rủi ro

| ID | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| RK-01 | DB và storage không có transaction chung → object mồ côi hoặc metadata trỏ tới object không có | Cao | Ghi object trước rồi mới ghi DB; xoá best-effort + log `storage.orphan`; chấp nhận object mồ côi (CR-007, ARCHITECTURE §A6) |
| RK-02 | Sai phân quyền làm lộ tài liệu Private (S2 đã nêu) | Cao | Policy tập trung một chỗ; test tự động ma trận C3.2 |
| RK-03 | Tệp lớn qua ALB/Node bị timeout | TB | Timeout ở ARCHITECTURE §A10.4; thử ở M5 |
| RK-04 | Không có HTTPS làm cookie phiên đi qua kênh không mã hoá | TB | OD-05; nếu không có HTTPS thì ghi là rủi ro được chấp nhận cho demo |
| RK-05 | Ứng dụng chủ yếu chờ I/O, CPU khó tăng, khó kích hoạt ASG khi demo | TB | Chọn metric phù hợp + thử tải trước (OD-09) |
| RK-06 | Có thông tin (cuối 2025) rằng MinIO ngừng phát hành image miễn phí | TB | Đã xảy ra: thay bằng SeaweedFS 4.48 (CR-001); adapter chỉ dùng S3 API nên không đổi mã |
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
| OD-01 | Stack React + TS + Vite / Node 24 + Express 5 + Prisma / MySQL 8.4 / MinIO / Docker Compose? | Chấp nhận (ARCHITECTURE §A1); storage local đổi sang SeaweedFS (CR-001) | M1, M3 |
| OD-02 | 50 MB = 52 428 800 byte? | Có | — |
| OD-03 | Private của người khác → 404; thao tác trái phép trên Public → 403? | Có | — |
| OD-04 | Đăng ký xong tự đăng nhập; báo "email đã được sử dụng"? | Có | — |
| OD-05 | Production dùng HTTPS (tên miền + ACM) hay HTTP qua DNS của ALB? | **Quyết định ở M5**; thiết kế hỗ trợ cả hai | M5 |
| OD-06 | Egress cho EC2 private: chỉ S3 Gateway Endpoint / thêm Interface Endpoint / NAT? | **Quyết định ở M5** | M5 |
| OD-07 | Cách cấp mật khẩu RDS cho EC2 (SSM Parameter Store, user data…)? | Quyết định ở M5 cùng OD-06 | M5 |
| OD-08 | Sửa `.github/workflows/ci.yml` (owner bảo vệ) để chạy integration test? | Đề xuất ở M1-11; owner duyệt PR | — |
| OD-09 | Metric ASG cho demo: CPU hay `ALBRequestCountPerTarget`? | Quyết định ở M5 sau thử tải | M5 |
| OD-10 | Giữ trang chi tiết tài liệu (P-04) và bộ lọc loại tệp? | Giữ (rẻ, hỗ trợ chia sẻ bằng link) | — |
| OD-11 | Ân hạn 120 s trước khi xoá object cũ sau thay thế? | Không — bỏ theo CR-007: thử xoá ngay sau UPDATE | — |
| OD-12 | Phiên cố định 7 ngày, không gia hạn trượt? | Có | — |
| OD-13 | Node.js 24 LTS cho dev, CI (`lts/*`) và EC2? | Có | M1 |
| OD-14 | Local dùng Docker Desktop hay cài MySQL/MinIO trực tiếp? | Cả hai: Docker Compose, hoặc `run.bat` với MySQL/SeaweedFS portable (CR-004) | M1 |

## C7. Scope Freeze / Requirements Baseline

```text
REQUIREMENTS_BASELINE: 1.0
FUNCTIONAL:      FR-01 … FR-09 (C4), BR-01 … BR-11
NON-FUNCTIONAL:  C5 (M = bắt buộc, P = mục tiêu đề xuất)
ACTORS:          Guest, User (Owner là vai trò theo từng tài liệu)
OUT OF SCOPE:    C2.2
OPEN DECISIONS:  OD-01 … OD-14 (C6.6). OD-05, OD-06, OD-07, OD-09 chuyển sang M5
STATUS:          APPROVED — owner đã duyệt (MILESTONES › OWNER DESIGN APPROVAL); thay đổi sau đó theo CR-xxx
```

Sau khi owner duyệt, mọi thay đổi phạm vi phải ghi vào **Nhật ký thay đổi baseline** (MILESTONES) và được owner chấp thuận trước khi triển khai.

Các giai đoạn mở rộng ở §C8 được thêm vào phạm vi qua CR-009 (owner 30/10/2026): E1–E3, E6–E8 đã duyệt; E4–E5 hoãn.

## C8. Mở rộng đề xuất (E1–E8)

> **APPROVED — E1–E3, E6–E8 (owner 30/10/2026, CR-009). E4–E5: DEFERRED (XOD-21).** Phần mở rộng tuỳ chọn, không phải điều kiện của bài tập cloud. Chưa có tính năng nào dưới đây được triển khai. Phần nào của E1–E3, E7 dùng avatar, username hay bạn bè chỉ làm khi E4/E5 được làm lại. Thiết kế: [ARCHITECTURE §A12](ARCHITECTURE.md#a12-mở-rộng-đề-xuất-e1e8). Task: [MILESTONES › E1–E8](MILESTONES.md#e1e8--mở-rộng-đề-xuất).
>
> Nguyên tắc chung: **đơn giản nhất có thể, không overengineering.** Không thêm dịch vụ, Redis, WebSocket, hàng đợi, Prometheus/Grafana, Elasticsearch, tracing phân tán. Dependency mới duy nhất: `sharp` (E4).

### C8.0 Phạm vi, quy ước, quy tắc chung

"Phase 1–8" trong yêu cầu của owner tương ứng **E1–E8**.

| Giai đoạn | Tên | Nơi chạy | Ai dùng |
|---|---|---|---|
| E1 | Local Admin Dashboard | Chỉ máy owner (`localhost:5173/admin`) | Developer |
| E2 | Quản lý người dùng | Chỉ máy owner | Developer |
| E3 | Giám sát hiệu năng | Đo trong Express, xem ở admin | Developer |
| E4 | Hồ sơ (avatar, tên hiển thị, bio) | Ứng dụng public | User |
| E5 | Username, tìm người dùng, bạn bè | Ứng dụng public | Guest/User |
| E6 | Chỉ báo độ mạnh mật khẩu | Frontend public | Người đăng ký |
| E7 | Audit log và chẩn đoán lỗi | Ghi trong ứng dụng public; xem ở admin | Developer |
| E8 | Khôi phục ngữ cảnh dự án | Tài liệu | Developer, owner |

**ID:** `E<n>-FR-xx` chức năng · `E<n>-AC-xx` tiêu chí chấp nhận · `XBR-xx` quy tắc · `XOD-xx` quyết định owner. Thiết kế ở ARCHITECTURE §A12 dùng `XD`, `XM`/`XA` (module), `ADM`, `API-15+`, `XSEQ`, `XR`; task `E<n>-xx` ở MILESTONES.

**Thuật ngữ:** *Developer* là tài khoản công cụ local hiện có (ARCHITECTURE §A5.9), không phải bản ghi trong `users`; "admin" trong §C8 là developer dùng trang `/admin`. *Mã admin* là mã trong thư mục bị `.gitignore`, chỉ có trên máy owner. *Registered user* là tài khoản đang tồn tại và không đang bị xoá. *Active user* là user có request đã đăng nhập trong khoảng thời gian đang xét. *Sự kiện audit* là một thao tác nghiệp vụ có ý nghĩa đã được ghi lại. *Lỗi chẩn đoán* là một dòng log lỗi/cảnh báo có cấu trúc.

**Hiện trạng làm nền** (mã ở commit `80dc3a9`):
- Có ba bảng `users`, `sessions`, `documents`. `documents.owner_id` là FK `RESTRICT`; `sessions.user_id` là FK `CASCADE`.
- `ObjectStorage` có put/get/delete/checkHealth. Xoá object là best-effort, lỗi ghi log `storage.orphan` (CR-007).
- Mỗi request có `requestId` (header `X-Request-Id`). `pino-http` ghi một dòng JSON khi request kết thúc, gồm status, `durationMs`, `userId`. `errorHandler` ghi thêm dòng ERROR kèm `code` cho lỗi 5xx.
- Controller local ở `127.0.0.1:3001` thu stdout của các dịch vụ vào `backend/tmp/local-services.ndjson`. File tối đa 2 MB và giữ một file cũ.
- Panel developer nằm trong `frontend/src/dev`.
- Chưa có admin, audit, hồ sơ, username, bạn bè, số liệu hiệu năng hay chỉ báo mật khẩu.

| ID | Quy tắc chung |
|---|---|
| XBR-01 | Admin chạy trong tiến trình riêng, chỉ trên máy owner. Mã admin bị `.gitignore`: không push, không có trong bản build, không lên AWS. Ứng dụng public không có route admin. Repo clone về (không có mã admin) vẫn build, test, chạy bình thường |
| XBR-02 | Quyền admin chỉ đến từ developer auth hiện có. Không thêm vai trò admin vào `users` |
| XBR-03 | Không API nào trả `password_hash`, token/ID phiên, khoá S3, chuỗi kết nối DB |
| XBR-04 | Bạn bè **không** thay đổi quyền tài liệu: Private vẫn chỉ owner xem (BR-01) |
| XBR-05 | MySQL là nguồn sự thật; bản ghi không bao giờ trỏ tới object chưa ghi xong. Object key do server sinh |
| XBR-06 | Tài khoản đang bị xoá (`DELETING`) coi như không tồn tại với ứng dụng public: không đăng nhập được; hồ sơ và tài liệu không hiển thị |
| XBR-07 | Hồ sơ public gồm username, tên hiển thị, bio, avatar, tài liệu Public. Không bao giờ có email. Guest xem được; tìm user cần đăng nhập; admin xem được mọi hồ sơ (kể cả `DELETING`) và email |
| XBR-08 | Không reset DB. Migration chỉ thêm cột/bảng, giữ nguyên dữ liệu cũ. Sao lưu trước khi áp |

### C8.1 E1 — Local Admin Dashboard

| ID | Yêu cầu |
|---|---|
| E1-FR-01 | Trang `/admin` chỉ có trên Vite dev `localhost:5173` của máy có mã admin, và cần đăng nhập developer |
| E1-FR-02 | Panel developer hiện có (Backend ON/OFF, Restart, Start/Stop All, Services, log) chuyển khỏi trang public vào `/admin`, giữ nguyên chức năng. Máy không có mã admin dùng `Start.vbs`, `Stop.vbs`, `run.bat` |
| E1-FR-03 | Dashboard hiển thị: registered users; active users (15 phút, 24 giờ, 7 ngày); số tài liệu (tổng, Public, Private); dung lượng logic (tổng kích thước tệp theo DB); dung lượng đĩa thật của SeaweedFS; trạng thái MySQL, SeaweedFS, backend |
| E1-FR-04 | Ứng dụng ghi thời điểm hoạt động gần nhất của user (`last_active_at`), tối đa 1 lần ghi / 5 phút / user |
| E1-FR-05 | Khi backend tắt, `/admin` vẫn mở được; số liệu từ DB và điều khiển dịch vụ vẫn dùng được |

| ID | Tiêu chí chấp nhận |
|---|---|
| E1-AC-01 | `http://localhost:3000/admin` → trang "Không tìm thấy"; `GET :3000/api/admin/...` → 404 |
| E1-AC-02 | `git ls-files` không có đường dẫn admin; bản build không chứa mã admin; clone sạch chạy `npm ci && npm run lint && npm run build && npm test` PASS |
| E1-AC-03 | Gọi admin không qua controller (sai token, không phải loopback) → 403; chưa đăng nhập developer → 401 |
| E1-AC-04 | Có 3 user, trong đó 1 user hoạt động trong 15 phút → registered = 3, active 15 phút = 1 |
| E1-AC-05 | 2 tài liệu Public 1 MiB + 1 Private 2 MiB → tổng 3 tài liệu (2 Public, 1 Private), dung lượng logic 4 MiB; dung lượng đĩa > 0 |
| E1-AC-06 | Khi chạy dev, trang public không còn panel developer. Tắt backend từ `/admin` → điều khiển, log, số liệu DB vẫn hoạt động |

### C8.2 E2 — Quản lý người dùng

| ID | Yêu cầu |
|---|---|
| E2-FR-01 | Tìm user theo email, tên hiển thị, username; phân trang 20/trang |
| E2-FR-02 | Xem toàn bộ hồ sơ: email, tên hiển thị, username, bio, avatar, ngày tạo, hoạt động gần nhất, số phiên còn hạn, số tài liệu (Public/Private), dung lượng, số bạn bè (sau E5), trạng thái |
| E2-FR-03 | Sửa email (đúng định dạng, không trùng; hiếm khi dùng), tên hiển thị, bio, username (không bị thời gian chờ). Không xem hay đặt mật khẩu |
| E2-FR-04 | Thu hồi mọi phiên của user |
| E2-FR-05 | Xoá vĩnh viễn tài khoản: mọi tài liệu (Public và Private) và object, avatar, bạn bè, phiên, sự kiện audit của user (XBR-24), rồi user |
| E2-FR-06 | Nếu xoá lỗi giữa chừng, **thử lại được** bằng chính nút xoá ("Tiếp tục xoá") |
| E2-FR-07 | Mọi thao tác sửa/thu hồi/xoá được ghi thành sự kiện audit (E7); trang chi tiết user hiện 20 sự kiện gần nhất liên quan tới user |

| ID | Quy tắc xoá tài khoản |
|---|---|
| XBR-09 | Phải gõ đúng email của user để xác nhận (ở UI và API) |
| XBR-10 | Bước 1: đánh dấu `DELETING` và xoá mọi phiên. Từ đây user không đăng nhập được và tài liệu bị ẩn |
| XBR-11 | Xoá object trước, rồi mới xoá bản ghi tài liệu của nó. Bản ghi còn lại là việc còn phải làm khi thử lại |
| XBR-12 | Storage lỗi → dừng, báo "chưa hoàn tất, còn N tài liệu"; user giữ `DELETING`. Không xoá user khi còn tài liệu/avatar. Không có thùng rác, không khôi phục |

| ID | Tiêu chí chấp nhận |
|---|---|
| E2-AC-01 | Tìm "nguyen" khớp email/tên, không phân biệt hoa thường; response không có `passwordHash` |
| E2-AC-02 | Sửa email sai định dạng → 400; trùng email khác → 409; hợp lệ → user đăng nhập được bằng email mới. Sự kiện audit ghi tên trường đã sửa, không ghi giá trị |
| E2-AC-03 | Sau khi thu hồi phiên, cookie cũ của user gọi `/api/documents/mine` → 401 |
| E2-AC-04 | User có 2 Public + 2 Private (+ avatar, bạn bè khi có E4/E5): xoá xong → không còn bản ghi, object, phiên, user; đăng ký lại cùng email được |
| E2-AC-05 | Dừng SeaweedFS giữa chừng → "chưa hoàn tất"; tài liệu còn lại không xem/tìm/tải được. Bật lại, bấm "Tiếp tục xoá" → hoàn tất |
| E2-AC-06 | Gõ sai email xác nhận → 400, không có gì thay đổi. Bấm xoá hai lần liên tiếp → kết quả cuối giống bấm một lần |

### C8.3 E3 — Giám sát hiệu năng

| ID | Yêu cầu |
|---|---|
| E3-FR-01 | Trong 5 phút gần nhất: request/giây, số request đang xử lý, P50/P95 thời gian phản hồi, tỉ lệ lỗi 4xx và 5xx |
| E3-FR-02 | CPU và RAM của backend và của máy; độ trễ event loop |
| E3-FR-03 | Sức khoẻ DB và storage (ok/lỗi, độ trễ) |
| E3-FR-04 | Registered users và active users là hai chỉ số riêng; UI ghi định nghĩa của từng chỉ số |
| E3-FR-05 | Có script và hướng dẫn thử tải, chạy trên DB/bucket riêng, không đụng dữ liệu thật |
| E3-FR-06 | Không thêm cache. Hiện trạng cache ở §C8.9; điều kiện để thêm cache ở ARCHITECTURE §A12.6 |

Số liệu chỉ nằm trong bộ nhớ của backend, kích thước cố định, mất khi khởi động lại. E3 chỉ giữ **số đếm tổng hợp**; chi tiết từng lỗi thuộc E7 (XBR-26).

| ID | Tiêu chí chấp nhận |
|---|---|
| E3-AC-01 | 100 request trong 10 giây → dashboard báo ≈ 10 req/s |
| E3-AC-02 | Unit test với thời gian phản hồi đã biết → P50/P95 đúng. Bộ nhớ không tăng theo số request |
| E3-AC-03 | Dừng SeaweedFS → storage báo lỗi trong ≤ 15 giây |
| E3-AC-04 | Script thử tải chạy được và có báo cáo mẫu: kết quả mỗi kịch bản, kết luận điểm nghẽn, chênh lệch khi bật/tắt phần đo (mục tiêu < 2%) |

### C8.4 E4 — Hồ sơ người dùng

> **DEFERRED** (XOD-21, owner 30/10/2026): chưa làm; làm lại cần CR mới.

| ID | Yêu cầu |
|---|---|
| E4-FR-01 | User tải avatar JPEG/PNG/WebP và cắt vuông trong trình duyệt. Server mã hoá lại thành WebP 512×512 và xoá metadata (EXIF, GPS) |
| E4-FR-02 | Avatar lưu trong SeaweedFS/S3 qua `ObjectStorage`. Thay avatar thất bại thì giữ avatar cũ; thành công thì xoá avatar cũ. Có thể xoá avatar (quay về chữ cái đầu) |
| E4-FR-03 | User tự sửa tên hiển thị và bio |
| E4-FR-04 | Bấm tên mình ở header → trang hồ sơ `/me/profile` |

| ID | Quy tắc |
|---|---|
| XBR-13 | Ảnh gửi lên ≤ 1 MiB, mỗi cạnh 64–4096 px, nhận dạng theo nội dung (không tin đuôi tệp). Không hỗ trợ SVG, GIF, HEIC |
| XBR-14 | Bio 0–300 ký tự, cho phép xuống dòng, hiển thị dạng chữ thuần. Tên hiển thị theo quy tắc hiện có (1–100 ký tự) |
| XBR-15 | Chỉ chính user (và admin qua E2) sửa được hồ sơ của user đó. Quyền tài liệu không đổi |

| ID | Tiêu chí chấp nhận |
|---|---|
| E4-AC-01 | Tải PNG hợp lệ → header và hồ sơ hiện avatar; object là WebP 512×512, không có EXIF |
| E4-AC-02 | Tệp `.png` thực chất là PDF/SVG → 415; > 1 MiB → 413; 5000×5000 px → 400 |
| E4-AC-03 | Thay avatar khi storage dừng → báo lỗi, avatar cũ vẫn hiện. Thay thành công → object cũ bị xoá (hoặc có log `storage.orphan`) |
| E4-AC-04 | Đổi tên hiển thị → tài liệu Public của user hiện tên mới. Bio 301 ký tự → lỗi; bio chứa `<script>` hiển thị nguyên văn |
| E4-AC-05 | Guest gọi API sửa hồ sơ → 401. Ma trận phân quyền tài liệu (`authz-matrix`) vẫn PASS 100% |

### C8.5 E5 — Username, tìm người dùng, bạn bè

> **DEFERRED** (XOD-21, owner 30/10/2026): chưa làm; làm lại cần CR mới.

| ID | Yêu cầu |
|---|---|
| E5-FR-01 | Mỗi user có username duy nhất, không phân biệt hoa thường, tách biệt với tên hiển thị; bắt buộc khi đăng ký |
| E5-FR-02 | Tài khoản cũ được tự cấp username, không mất dữ liệu, không reset DB |
| E5-FR-03 | User đổi username tối đa 1 lần / 7 ngày |
| E5-FR-04 | User đã đăng nhập tìm người khác theo username hoặc tên hiển thị |
| E5-FR-05 | Hồ sơ public `/u/{username}` (Guest xem được): avatar, tên, username, bio, tài liệu **Public**, nút kết bạn. Tên người đăng trên tài liệu dẫn tới hồ sơ này |
| E5-FR-06 | Gửi, huỷ, chấp nhận, từ chối lời mời; huỷ kết bạn; xem danh sách bạn bè và lời mời của chính mình. Danh sách bạn bè là riêng tư |
| E5-FR-07 | Không có chat, nhắn tin realtime, gợi ý bạn bè |

| ID | Quy tắc |
|---|---|
| XBR-16 | Username 3–30 ký tự `a–z 0–9 _ .`, bắt đầu và kết thúc bằng chữ/số, lưu chữ thường. Cấm các tên `admin`, `api`, `me`, `login`, `register`, `upload`, `documents`, `u`, `settings`, `root`, `system` |
| XBR-17 | Thời gian chờ đổi username tính từ lần đặt gần nhất (đăng ký tính là một lần). Username tự cấp cho tài khoản cũ đổi được ngay lần đầu. Admin sửa không bị giới hạn. Username cũ được giải phóng ngay |
| XBR-18 | Tự mời mình → 400. Mỗi cặp user chỉ có một quan hệ. Gửi lại khi đang chờ → trả lời mời cũ. Đã là bạn → 409. Nếu người kia đã mời mình trước → thành bạn luôn |
| XBR-19 | Chỉ người nhận được chấp nhận. Người gửi huỷ hoặc người nhận từ chối đều xoá lời mời. Một trong hai người được huỷ kết bạn. Thao tác lên quan hệ không phải của mình → 404 |
| XBR-20 | Bạn bè không thấy tài liệu Private của nhau ở bất kỳ đâu |

| ID | Tiêu chí chấp nhận |
|---|---|
| E5-AC-01 | Sau migration, mọi user cũ có username hợp lệ, duy nhất; số user/tài liệu/phiên không đổi; vẫn đăng nhập được |
| E5-AC-02 | Đăng ký `Alice` khi đã có `alice` → 409; `admin` → 400. `/u/ALICE` mở cùng hồ sơ với `/u/alice`; hồ sơ không có email, chỉ có tài liệu Public |
| E5-AC-03 | Vừa đăng ký đã đổi username → 409 kèm ngày được đổi; sau 7 ngày (giả lập) → đổi được |
| E5-AC-04 | A mời B; A mời lại → cùng lời mời; B mời A → thành bạn; A tự mời → 400. A và B mời nhau đồng thời → đúng một quan hệ bạn bè |
| E5-AC-05 | A và B là bạn: B xem/tải tài liệu Private của A → 404. Người ngoài chấp nhận lời mời A→B → 404 |
| E5-AC-06 | Guest tìm user → 401; Guest mở `/u/{username}` → xem được. Xoá tài khoản B (E2) → B biến mất khỏi danh sách bạn của A |

### C8.6 E6 — Chỉ báo độ mạnh mật khẩu

| ID | Yêu cầu |
|---|---|
| E6-FR-01 | Form đăng ký (và form đặt mật khẩu mới nếu sau này có) hiện chỉ báo khi gõ |
| E6-FR-02 | Ba tiêu chí: (1) có chữ hoa; (2) có ký tự đặc biệt; (3) dài hơn 12 ký tự |
| E6-FR-03 | < 8 ký tự → **Quá ngắn**; 0 tiêu chí → **Yếu** (trắng); 1–2 → **Trung bình** (nâu nhạt); 3 → **Mạnh** (nâu đậm) |
| E6-FR-04 | Chỉ để tham khảo: không chặn đăng ký; server giữ quy tắc 8–128 ký tự. Có dòng ghi chú "Chỉ là gợi ý theo ba quy tắc đơn giản, không phải đánh giá bảo mật đầy đủ." |

Độ dài tính theo ký tự Unicode. Chữ hoa gồm cả chữ hoa tiếng Việt ("Đ", "Ầ"). Ký tự đặc biệt là ký tự không phải chữ và không phải số. Mật khẩu không được gửi đi đâu để chấm. Luôn có nhãn chữ, không chỉ dựa vào màu; mức Yếu có viền để thấy trên nền sáng.

| ID | Tiêu chí chấp nhận |
|---|---|
| E6-AC-01 | `abc` Quá ngắn · `abcdefgh` Yếu · `Abcdefgh` Trung bình · `Abcdefgh!` Trung bình · `abcdefghijklm` Trung bình · `Abcdefgh!xyz1` Mạnh · `Đặcbiệt12345` Trung bình, thêm `#` → Mạnh |
| E6-AC-02 | Mật khẩu "Yếu" ≥ 8 ký tự vẫn đăng ký được; không có request mạng khi gõ; trình đọc màn hình đọc được mức |

### C8.7 E7 — Audit log và chẩn đoán lỗi

**Mục tiêu.** Biết *ai đã làm gì, khi nào, kết quả ra sao*, và tìm nhanh *lỗi nằm ở module nào, bước nào, của request nào*. Dùng lại `requestId`, log Pino, file log của controller, MySQL và admin local. Không thêm dịch vụ.

| ID | Yêu cầu |
|---|---|
| E7-FR-01 | Ghi sự kiện audit cho các thao tác có ý nghĩa: đăng ký, đăng nhập (kể cả thất bại), đăng xuất; tải lên, tải xuống, sửa metadata, thay tệp, xoá tài liệu; sửa hồ sơ, avatar, username (E4/E5); gửi, chấp nhận, huỷ/từ chối lời mời, huỷ kết bạn (E5); thao tác admin (E2). Giai đoạn nào chưa làm thì chưa có sự kiện của giai đoạn đó |
| E7-FR-02 | Mỗi sự kiện có: thời điểm, actor (user, developer hoặc ẩn danh), hành động, đối tượng (loại + id), kết quả (`SUCCESS`/`FAILURE` + mã lỗi), `requestId` |
| E7-FR-03 | Admin lọc sự kiện theo actor, hành động, đối tượng, kết quả, khoảng thời gian; mới nhất trước; phân trang 50/trang |
| E7-FR-04 | Thời gian lưu cấu hình được bằng biến môi trường (mặc định 90 ngày). Sự kiện quá hạn bị xoá |
| E7-FR-05 | Mỗi lỗi chẩn đoán có: module, bước (stage), mã lỗi, `requestId`, HTTP status, thời điểm, thời lượng request |
| E7-FR-06 | Tổng hợp số lỗi theo module và theo mã lỗi, trong 15 phút / 1 giờ / 24 giờ |
| E7-FR-07 | Nhập một `requestId` → thấy mọi dòng log lỗi/cảnh báo và mọi sự kiện audit của request đó |
| E7-FR-08 | Admin có hai mục **Activity Logs** và **Errors**: bộ lọc, bảng tổng hợp, chi tiết lỗi. Chỉ có trong admin local |

| ID | Quy tắc |
|---|---|
| XBR-21 | **Không** ghi: lượt xem trang, thao tác gõ phím, tìm kiếm, xem chi tiết, `GET /api/auth/me`, health check, body request, tiêu đề/mô tả/tên tệp, email (trừ email đã che khi xoá tài khoản, XOD-06), mật khẩu, cookie, token, IP, user-agent |
| XBR-22 | Ghi audit **không được** làm hỏng hay đổi kết quả thao tác nghiệp vụ. Sự kiện được ghi sau khi thao tác xong, không chung transaction. Nếu ghi lỗi, thao tác giữ nguyên kết quả nhưng **phải** có log ERROR `audit.write_failed` kèm `requestId` và hiện trong mục Errors (không im lặng) |
| XBR-23 | Chỉ developer qua admin local đọc được audit và lỗi. Ứng dụng public không có endpoint đọc audit; User không xem được audit, kể cả của chính mình |
| XBR-24 | Khi xoá tài khoản (E2): xoá mọi sự kiện mà user là actor; giữ sự kiện admin về tài khoản đó, chỉ kèm id và email đã che. Sự kiện của người khác lên tài liệu của user (vd. tải xuống) giữ tới hết hạn; chúng chỉ chứa id nên không tra ra được ai |
| XBR-25 | Lỗi chẩn đoán đọc từ log có sẵn, không lưu thêm bản sao. Local: trong phạm vi file log của controller (khoảng 2 × 2 MB gần nhất). AWS: CloudWatch Logs nếu OD-06 cho phép |
| XBR-26 | E3 giữ số đếm tổng hợp trong bộ nhớ; E7 giữ bản ghi từng sự kiện/lỗi. E7 không tự đếm request; E3 không lưu chi tiết. Hai bên không thu thập trùng |

| ID | Tiêu chí chấp nhận |
|---|---|
| E7-AC-01 | A đăng nhập, tải lên, tải xuống, xoá tài liệu, đăng xuất → 5 sự kiện `SUCCESS` đúng thứ tự, đúng actor, đối tượng và `requestId` (trùng header `X-Request-Id`) |
| E7-AC-02 | Đăng nhập sai → 1 sự kiện `FAILURE` `INVALID_CREDENTIALS`, actor ẩn danh, không có email. B tải tài liệu Private của A → `FAILURE` `DOCUMENT_NOT_FOUND`, actor B |
| E7-AC-03 | Mở trang, tìm kiếm, xem chi tiết, gọi `/api/auth/me` và health không tạo sự kiện. Bảng audit không chứa mật khẩu, email, tiêu đề đã dùng khi test (kiểm bằng `SELECT … LIKE`) |
| E7-AC-04 | Giả lập ghi audit lỗi → upload vẫn 201, tài liệu tồn tại; log có `audit.write_failed` kèm `requestId`; mục Errors hiện lỗi đó |
| E7-AC-05 | `AUDIT_RETENTION_DAYS=1` và có sự kiện 2 ngày tuổi → sau khi khởi động lại, sự kiện cũ bị xoá, sự kiện mới còn |
| E7-AC-06 | Lọc actor + hành động + khoảng thời gian trả đúng tập; phân trang đúng tổng |
| E7-AC-07 | Gây lỗi storage khi upload → Errors có dòng `module=documents`, `stage=storage.put`, `code=STORAGE_UNAVAILABLE`, status 503, `durationMs`, `requestId`; tổng hợp 15 phút đếm 1 lỗi ở `documents` |
| E7-AC-08 | Nhập `requestId` của E7-AC-07 → thấy dòng lỗi và sự kiện audit `FAILURE` của cùng request |
| E7-AC-09 | `:3000/api/admin/activity` và `:3000/api/admin/errors` → 404. Gọi ADM-08…10 không qua controller → 403 |
| E7-AC-10 | Xoá tài khoản A → không còn sự kiện có actor là A; còn sự kiện `ADMIN_ACCOUNT_DELETE` với email đã che |

### C8.8 E8 — Khôi phục ngữ cảnh dự án

**Mục tiêu.** Developer hoặc owner quay lại sau nhiều tuần/tháng nắm lại dự án trong khoảng **10 phút**, chỉ bằng bốn tài liệu hiện có.

| ID | Yêu cầu |
|---|---|
| E8-FR-01 | PROJECT_OVERVIEW có mục "Project Re-entry — 10-Minute Guide" ở đầu, gồm: mục đích và yêu cầu cốt lõi; kiến trúc tổng thể; module chính, trách nhiệm, phụ thuộc; ba luồng xác thực, upload/download, phân quyền; bất biến và quyết định quan trọng; trạng thái DONE/PROPOSED/BLOCKED; lệnh khởi động, health check, test; việc ưu tiên lấy từ MILESTONES; link tới CONTEXT, ARCHITECTURE, MILESTONES |
| E8-FR-02 | Có quy trình khôi phục ngữ cảnh 6 bước: đọc hướng dẫn 10 phút → tìm module và hợp đồng input/output → xem quyết định và phụ thuộc liên quan → đọc trạng thái milestone mới nhất → chạy test liên quan trước khi sửa → cập nhật tài liệu khi quyết định đã duyệt thay đổi |
| E8-FR-03 | Mỗi module (MVP ở ARCHITECTURE §A3.6, mở rộng ở §A12.3) trả lời được ba câu: input/output là gì; phụ thuộc vào gì; lỗi thì chuyện gì xảy ra |
| E8-FR-04 | Trạng thái cache được ghi đúng với mã (§C8.9) |
| E8-FR-05 | Không tạo file tài liệu mới. Hướng dẫn chỉ tóm tắt và dẫn link, không chép lại đặc tả |

| ID | Quy tắc |
|---|---|
| XBR-27 | Hướng dẫn 10 phút không phải nguồn sự thật. Khi mâu thuẫn, CONTEXT/ARCHITECTURE/MILESTONES thắng và hướng dẫn phải được sửa |
| XBR-28 | Khi một quyết định đã duyệt thay đổi (CR) hoặc trạng thái milestone đổi, hướng dẫn được cập nhật trong cùng PR |

| ID | Tiêu chí chấp nhận |
|---|---|
| E8-AC-01 | Một thành viên chưa đọc tài liệu, chỉ dùng hướng dẫn và link của nó, trả lời đúng ≥ 8/10 câu hỏi kiểm tra (MILESTONES E8-02) trong ≤ 10 phút |
| E8-AC-02 | Mọi link trong hướng dẫn mở đúng mục (không có anchor hỏng) |
| E8-AC-03 | Trạng thái trong hướng dẫn khớp MILESTONES; không tính năng PROPOSED nào được mô tả là đã có |
| E8-AC-04 | Mỗi module ở §A3.6 và §A12.3 có đủ input/output, phụ thuộc, hành vi lỗi |
| E8-AC-05 | Phát biểu về cache khớp mã: `backend/src/http/static.ts`, `noStore()` trong `request-context.ts`, header của API-13 |

### C8.9 Ảnh hưởng tới baseline và hiện trạng cache

Khi owner duyệt, CR phải được ghi vào Nhật ký thay đổi baseline (MILESTONES) trước khi làm giai đoạn tương ứng:

| Baseline | Thay đổi | Giai đoạn |
|---|---|---|
| §C2.2 loại trừ trang quản trị, xoá tài khoản, thống kê | Admin local (không phải vai trò web) | E1–E3, E7 |
| §C2.2 loại trừ mạng xã hội và "đổi tên hiển thị" | Thêm hồ sơ, user tự đổi tên hiển thị, bạn bè | E4–E5 |
| ARCHITECTURE §A7 (contract 1.0) | `UserDto`/`OwnerDto` thêm trường; đăng ký thêm `username` bắt buộc; thêm API-15…27 | E4–E5 |
| ARCHITECTURE §A4 | Thêm cột vào `users`; thêm bảng `friendships`, `audit_events` | E1, E2, E4, E5, E7 |
| ARCHITECTURE §A5.8, §A10.2 | Dòng log request thêm `module`, `stage`, `code`; biến `AUDIT_RETENTION_DAYS` | E7 |
| Panel developer (`frontend/src/dev`, `frontend/local-tests`), README, WINDOWS_HOSTING, TEAM_HANDOFF | Chuyển vào thư mục admin (gitignore), gỡ khỏi repo; cập nhật tài liệu | E1 |
| IAM §A10.9 (`documents/*`) | Nếu đưa E4 lên AWS: thêm `avatars/*`. Không đổi task M5 | E4 |
| PROJECT_OVERVIEW | Hướng dẫn 10 phút §0 | E8 |

Không đổi: FR-01…09, BR-01…11, ma trận quyền §C3.2, luồng tài liệu ARCHITECTURE §A6, kế hoạch và hạn M5.

**Hiện trạng cache** (đã đối chiếu mã ở `80dc3a9`):
- Có cache tài nguyên tĩnh ở chế độ production (`SERVE_FRONTEND=true`): `/assets/*` có hash → `public, max-age=31536000, immutable`; `index.html` và SPA fallback → `no-cache`.
- Mọi JSON dưới `/api` → `no-store`; tải xuống API-13 → `private, no-store`.
- **Không có** Redis hay cache ứng dụng/truy vấn phía server.
- Đề xuất duy nhất có cache: ảnh avatar API-18 `private, max-age=86400` (E4; URL đổi khi đổi ảnh).
- Chỉ xét tối ưu cache khi số đo E3 thoả điều kiện ở ARCHITECTURE §A12.6. Không có task cache trong E1–E8.

### C8.10 Quyết định của owner

XOD-01…21: owner quyết định ngày 30/10/2026 (XOD-15…21 duyệt trong chat, agent ghi lại theo yêu cầu của owner).

| ID | Câu hỏi | Quyết định / đề xuất |
|---|---|---|
| XOD-01 | Thứ tự giai đoạn | Không cố định; owner chọn từng task. Module phải rõ đầu vào/đầu ra |
| XOD-02 | Admin đặt ở đâu | Tiến trình riêng, không có trong bản build |
| XOD-03 | Panel developer | Chuyển sang `/admin`; toàn bộ mã admin bị `.gitignore` |
| XOD-04 | Admin sửa email? | Được, phải đúng định dạng và không trùng (hiếm dùng) |
| XOD-05 | Audit lưu ở đâu | Không dùng file; **thay bằng XOD-15** |
| XOD-06 | Audit giữ gì về người bị xoá | Id + email đã che (`n***@gmail.com`), để owner nhận ra đã xoá tài khoản nào mà không giữ email đầy đủ |
| XOD-07 | Mã hoá lại avatar | Có, bằng `sharp` |
| XOD-08 | User tự đổi tên hiển thị | Có |
| XOD-09 | Username khi đăng ký | Bắt buộc |
| XOD-10 | Đổi username | Chờ 7 ngày giữa hai lần |
| XOD-11 | Danh sách bạn bè | Riêng tư |
| XOD-12 | Xem hồ sơ, tìm user | Tìm cần đăng nhập; Guest xem hồ sơ public; admin xem mọi hồ sơ |
| XOD-13 | Công cụ thử tải | `autocannon` qua `npx`: công cụ dòng lệnh Node.js, bắn nhiều request đồng thời và báo req/s, P50/P95/P99, số lỗi; không thêm vào `package.json` |
| XOD-14 | Đo đĩa SeaweedFS | Có |
| XOD-15 | Audit lưu ở đâu (E7) | **Duyệt:** một bảng MySQL `audit_events` cho cả sự kiện user và admin. Lý do: sự kiện user phát sinh trên mọi instance (cả AWS), cần lọc, phân trang, xoá theo hạn. Đánh đổi: bảng có cả trên RDS |
| XOD-16 | Thời gian lưu audit | **Duyệt:** 90 ngày, đổi bằng `AUDIT_RETENTION_DAYS`; xoá lúc khởi động (như D-10), không worker |
| XOD-17 | Nguồn lỗi chẩn đoán | **Duyệt:** đọc file log sẵn có của controller, không tạo bảng lỗi. Đánh đổi: local chỉ xem được khoảng 2 × 2 MB log gần nhất |
| XOD-18 | Đăng nhập sai có ghi email? | **Duyệt:** không; actor ẩn danh |
| XOD-19 | Audit khi xoá tài khoản | **Duyệt:** xoá sự kiện của user, giữ sự kiện admin với email đã che (XBR-24) |
| XOD-20 | Nơi đặt hướng dẫn 10 phút | **Duyệt:** PROJECT_OVERVIEW §0, cập nhật theo XBR-28 |
| XOD-21 | Làm E4–E5 lúc này? | **Hoãn** (chưa cần). E4-04, E5-05 và các phần admin dùng avatar, username, bạn bè (ADM-04, `hasAvatar`, sửa/tìm username, `friendCount`) cũng hoãn. Làm lại cần CR mới |
