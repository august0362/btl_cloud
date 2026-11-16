# Tệp mẫu kiểm thử so trùng

Bộ mẫu gồm 18 tệp với cùng một chuỗi gốc 2.000 từ tổng hợp `word0` đến `word1999`. DOCX được lưu bằng Microsoft Word, PPTX được lưu bằng PowerPoint với 20 slide, PDF có 4 trang và lớp chữ. Các tệp đã có sẵn để chạy test trên mọi hệ điều hành, không cần cài Office.

Tỷ lệ dưới đây là MinHash ước tính trên các cụm 5 từ, không phải tỷ lệ số từ giữ nguyên. Cả ba định dạng cho cùng kết quả sau trích chữ. `same-text` có metadata và bytes khác bản gốc nhưng nội dung chữ giống hệt.

| Mẫu | DOCX | PDF | PowerPoint | Tỷ lệ so với bản gốc | Kết quả khi bản gốc đã Công khai |
|---|---|---|---|---|---|
| Bản gốc | [original.docx](original.docx) | [original.pdf](original.pdf) | [original.pptx](original.pptx) | 100% | Upload lại hoặc tải về rồi upload lại: 409 EXACT |
| Cùng chữ, khác metadata | [same-text.docx](same-text.docx) | [same-text.pdf](same-text.pdf) | [same-text.pptx](same-text.pptx) | 100% | 409 SAME_TEXT |
| Sửa 20 từ | [high.docx](high.docx) | [high.pdf](high.pdf) | [high.pptx](high.pptx) | 92,1875% | 409 SIMILAR_TEXT |
| Sửa 34 từ | [above-85.docx](above-85.docx) | [above-85.pdf](above-85.pdf) | [above-85.pptx](above-85.pptx) | 85,15625% | 409 SIMILAR_TEXT |
| Sửa 50 từ | [warning.docx](warning.docx) | [warning.pdf](warning.pdf) | [warning.pptx](warning.pptx) | 75,78125% | 201 kèm WARNING |
| Sửa 200 từ | [different.docx](different.docx) | [different.pdf](different.pdf) | [different.pptx](different.pptx) | 36,71875% | 201 ACCEPT |

Chỉ upload `original` trước rồi chọn **một** biến thể để thử. Nếu các biến thể đã được lưu trước đó, lần upload tiếp theo sẽ bị so với cả các tệp ấy. Dùng bộ integration để tự động cách ly từng ca.

## Chạy kiểm thử

Khởi động MySQL và SeaweedFS local, rồi chạy tại gốc dự án:

```sh
npm --prefix backend run test:integration -- duplicates-real-files
```

[Bộ 24 ca](../../integration/duplicates-real-files.test.ts) dùng cấu hình ứng dụng thật với chế độ chặn mặc định, MySQL `btl_cloud_test` và bucket `btl-cloud-documents-test`. Có thể ghi đè bằng các biến `TEST_*`; database phải có tên kết thúc `_test`. Bộ test kiểm tra cả Public/Private, khác tài khoản, tải xuống rồi upload lại, khác định dạng và thay tệp. Lượt bị chặn không được ghi object hoặc metadata mới; lượt thay tệp bị chặn phải giữ nguyên bản cũ. Các object và tài khoản do bộ này tạo được dọn sau từng ca.

## Tạo lại tệp mẫu

Chỉ bước tạo lại cần Microsoft Word và PowerPoint trên Windows. Tại gốc dự án:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File scripts/fixtures/generate-duplicate-documents.ps1
```

[Script tạo mẫu](../../../../scripts/fixtures/generate-duplicate-documents.ps1) thay toàn bộ 18 tệp trong thư mục này, đặt metadata tác giả thành `BTL Cloud tests` và giữ nguyên nội dung từ. Bytes có thể đổi theo phiên bản Office; các tỷ lệ và hành vi HTTP phải giữ nguyên. PDF scan không có lớp chữ và nội dung ngoài giới hạn trích chữ thuộc các bộ unit riêng.
