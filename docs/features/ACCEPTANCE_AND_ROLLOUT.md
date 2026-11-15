# ACCEPTANCE_AND_ROLLOUT — Nghiệm thu, test, cổng tích hợp, triển khai và rollback

> **Trạng thái: ĐÃ DUYỆT CÓ ĐIỀU KIỆN (16/11/2026), chờ duyệt cuối. Không thực thi bất kỳ bước AWS hay DB nào trong tài liệu này khi chưa được duyệt.**
> Liên quan: [SHARED_CONTRACTS](SHARED_CONTRACTS.md) · [DUPLICATE_DETECTION_SPEC](DUPLICATE_DETECTION_SPEC.md) · [HYBRID_RECOMMENDATION_SPEC](HYBRID_RECOMMENDATION_SPEC.md).

## 1. Mục tiêu và phạm vi

Tài liệu này định nghĩa tiêu chí nghiệm thu **kiểm được** cho Feature A, Feature B và phần tích hợp, cùng với benchmark, cổng merge, quy trình triển khai và rollback. Tài liệu **không** chứa số đo do chưa có; ô nào cần số đo đều ghi [Cần đo].

## 2. Hạ tầng test hiện có [Đã kiểm]

| Loại | Lệnh | Ghi chú |
|---|---|---|
| Unit backend | `npm --prefix backend test` | Vitest, không cần hạ tầng |
| Integration backend | `npm --prefix backend run test:integration` | MySQL + SeaweedFS thật, DB `btl_cloud_test`, chạy tuần tự; `global-setup` áp migration |
| Contract | `backend/test/integration/contract.test.ts` | Schema `.strict()` ở `test/helpers/contract.ts` |
| Lỗi storage giả | `backend/test/helpers/fault-storage.ts` | Dùng cho test bù trừ S3/RDS |
| Tệp mẫu | `backend/test/helpers/fixtures.ts` | Sinh PDF/DOCX/PPTX lúc chạy bằng `yazl` |
| Frontend | `npm --prefix frontend test`, `test:ui`, `test:e2e` | |
| Kiểm chứng | `scripts/verify/authz-matrix.mjs`, `upload-matrix.mjs` | Stack production-like `:3000` |
| Thử tải | `scripts/load/` | DB `btl_cloud_load` + bucket riêng |
| Hai instance | `PORT=3002` cùng DB/storage ([§A10.5](../ARCHITECTURE.md#a105-khởi-động-và-tắt)) | Dùng cho test đa instance |

**Quy tắc:** không reset `btl_cloud`. Chỉ `btl_cloud_test`, `btl_cloud_load`, `btl_cloud_migrate_scratch` được dùng để thử phá huỷ, và phải theo quy trình đồng ý của owner trong README.

## 3. Ma trận test — Feature A

Cấp: U = unit, I = integration, F = frontend, B = benchmark, E = đánh giá offline.

| ID | Cấp | Kịch bản | Tiêu chí đạt |
|---|---|---|---|
| DUP-T-01 | U | SHA-256 theo stream | Bằng `createHash` trên buffer cho tệp 0 B (không xảy ra trên API), 1 B và 5 MiB |
| DUP-T-02 | I | Cùng bytes, khác tên, cùng user, `block` | Lần 2 → 409 `DUPLICATE_DOCUMENT`; `error.duplicates[0].documentId` = lần 1; số dòng `documents` không đổi; không có object mới trong bucket |
| DUP-T-03 | I | Như T-02 nhưng `warn` / `off` | `warn`: 201, `result = WARNING`, `exactMatches` 1 phần tử. `off`: 201, `exactMatches = []`, `textAnalysis.reason = DISABLED` |
| DUP-T-04 | I | Cùng tên tệp, khác bytes | Không có `EXACT` |
| DUP-T-05 | I | B upload tệp trùng tài liệu **Private** của A (`block`) | 201; `result = ACCEPT`; `exactMatches = []`, `textMatches = []`; không trường nào trong response chứa id hay tiêu đề tài liệu của A |
| DUP-T-06 | I | B upload tệp **PUBLIC** trùng tài liệu **Public** của A | `warn`: WARNING, `ownedByYou: false`, `visibility: PUBLIC`; `block`: 409, `error.duplicates[0].documentId` = tài liệu của A |
| DUP-T-32 | I | B upload tệp **PRIVATE** trùng tài liệu **Public** của A, `block` | 201, `result = WARNING`, `exactMatches[0].ownedByYou = false`; có dòng `documents` mới |
| DUP-T-33 | I | B thay tệp của tài liệu X (của B) bằng bytes của tài liệu Public của A, `block` | X PUBLIC → 409, `file_version` giữ nguyên; X PRIVATE → 200 WARNING |
| DUP-T-34 | I | Cùng user upload lại tệp của mình khi bản cũ là **PRIVATE**, tệp mới PUBLIC hoặc PRIVATE, `block` | Cả hai trường hợp 409 |
| DUP-T-07 | I | A chuyển Public → Private, B upload tệp trùng | 201, không có match |
| DUP-T-08 | I | Chủ tài liệu trùng đang DELETING | Không có match |
| DUP-T-09 | I | **Đồng thời:** 2 request cùng user, cùng bytes, `block`, gửi song song tới 2 app instance chung DB (lặp 20 lần) | Mỗi lần: đúng 1 × 201 và 1 × 409; 1 dòng `documents`; không có object thừa (hoặc có log `storage.orphan`). Race **khác user** không kiểm (DR-07 hoãn) |
| DUP-T-10 | I | Thay tệp X bằng bytes của Y (cùng chủ), `block` | 409; `file_version` của X giữ nguyên; tải X ra vẫn đúng bytes cũ; object mới đã xoá |
| DUP-T-11 | I | Thay tệp X bằng chính bytes hiện tại của X | 200, không có match |
| DUP-T-12 | I | Thay tệp thành công | `fingerprint.file_version = documents.file_version`; `sha256` là của tệp mới |
| DUP-T-13 | I | Xoá tài liệu rồi upload lại tệp đó | Không còn dòng fingerprint; upload lại không có match |
| DUP-T-14 | U | Trích chữ DOCX/PPTX/PDF có tiếng Việt | Chữ sau `tokenize` khớp chuỗi mong đợi; slide 1, 2, 10 theo đúng thứ tự |
| DUP-T-15 | U/I | PDF scan (không có lớp chữ) | `SKIPPED/INSUFFICIENT_TEXT`; UI không hiện "%" (F) |
| DUP-T-16 | U | PDF mã hoá; PDF hỏng sau header; XML DOCX hỏng | `ENCRYPTED` / `MALFORMED` / `MALFORMED`; upload vẫn 201 (I) |
| DUP-T-17 | U | ZIP bomb: `document.xml` 200 MiB toàn khoảng trắng, nén lại | Kết thúc trước 15 s, `PARTIAL/PART_LIMIT` hoặc `INSUFFICIENT_TEXT`; worker không bị giết vì hết heap |
| DUP-T-18 | U | Worker treo (hook test, deadline 200 ms) | `SKIPPED/TIMEOUT`; worker đã terminate; tmp xoá được |
| DUP-T-19 | U | **MinHash so với Jaccard thật:** 200 cặp tập tổng hợp (sinh xác định), J ∈ {0,1 … 0,9} | \|độ lệch TB\| ≤ 0,02 và sai số tuyệt đối TB ≤ 0,045 ở mọi mức J |
| DUP-T-20 | U | Tính xác định | Cùng chữ → 512 byte giống hệt giữa 2 process; snapshot 3 giá trị `A[0..2]`, `B[0..2]` |
| DUP-T-21 | U | `mulAddMod` | Khớp BigInt trên 10 000 mẫu xác định |
| DUP-T-22 | I | Gần trùng: tài liệu 2 000 từ; bản sao sửa 1 từ mỗi 40 từ | `textMatches[0].matchType = SIMILAR_TEXT`, `similarity ≥ 0.6` |
| DUP-T-23 | I | Cùng chữ, khác tệp (DOCX lưu lại với metadata khác) | `SAME_TEXT`, `similarity = 1` |
| DUP-T-24 | I | > 2 000 ứng viên trong dải kích thước (seed bằng SQL) | `candidatesScanned = 2000`, `candidatesTruncated = true` |
| DUP-T-25 | I | Hàng đợi: 1 job chạy + 3 chờ + 1 request nữa | Request thứ 5 → `BUSY`, vẫn 201 |
| DUP-T-26 | I | PutObject lỗi (`fault-storage`) | 503; không có dòng `documents` hay fingerprint |
| DUP-T-27 | I | INSERT lỗi sau PutObject | Lỗi gốc; object mới đã xoá; không có dòng |
| DUP-T-28 | I | Backfill | Chạy 2 lần cho kết quả giống nhau; bỏ qua tài liệu đổi `storage_key` giữa chừng; không xoá dòng nào |
| DUP-T-29 | I | Hồi quy | Toàn bộ test cũ qua với mặc định `warn`; `uploadResultSchema` = `documentDtoSchema` + `duplicateCheck` (strict) |
| DUP-T-30 | F | UploadPage / thay tệp | 409 hiện danh sách link và giữ dữ liệu form; WARNING hiện thông báo; SKIPPED hiện lý do, không có "%" |
| DUP-T-31 | U | Bất biến riêng tư | Với mọi response trong T-02…T-13: mọi `documentId` qua được `canView(doc, uploader)` |

## 4. Ma trận test — Feature B

Corpus REC-EVAL ở §5.2.

| ID | Cấp | Kịch bản | Tiêu chí đạt |
|---|---|---|---|
| REC-T-01 | U | `tokenize`, `foldForMatch` | "Điện Toán ĐÁM MÂY" → `điện toán đám mây`; fold → `dien toan dam may`; "AWS-S3" → `aws s3` |
| REC-T-02 | U | TF-IDF + cosine | Trong REC-EVAL, mọi tài liệu AWS có cos với "AWS S3 và EC2" lớn hơn mọi tài liệu Giải tích |
| REC-T-03 | I | Guest, corpus chưa có tương tác | `strategy = NEWEST`; thứ tự = `created_at DESC` |
| REC-T-04 | I | User mới (chưa bật), có tương tác của user **khác đã bật** | `strategy = POPULAR`; không chứa tài liệu của chính user; xem tài liệu → 0 dòng của user này |
| REC-T-05 | I | User **bật** cá nhân hoá, rồi xem 3 và tải 1 tài liệu chủ đề AI | `PERSONALIZED`; top-4 có ≥ 3 tài liệu AI chưa tương tác; không có tài liệu đã tương tác |
| REC-T-06 | I | User X (bật) thích AI, user Y (bật) thích AWS | Giao của top-4 hai người ≤ 1 tài liệu |
| REC-T-07 | I | **Truy vấn thắng sở thích:** user bật, thích AI, tìm `q=AWS`, `sort=relevance` | Mọi tài liệu có "AWS" trong tiêu đề đứng trước mọi tài liệu chỉ có "AWS" trong mô tả |
| REC-T-26 | U | **Tính chất `level`:** 500 bộ ứng viên ngẫu nhiên (seed cố định), `pref`/`pop`/`fresh` ngẫu nhiên | Không cặp nào có `level` cao hơn đứng sau `level` thấp hơn; đổi `pref` về 0 (Guest) chỉ đổi thứ tự **bên trong** cùng `level` |
| REC-T-27 | U | Bảng `level` §5.3 | `q="ai"`: tiêu đề "AI" → 5; "Nhập môn AI" → 4; "AIoT cơ bản" → 3; "Email" → 2; chỉ mô tả có "ai" → 1; gõ không dấu "dien toan" khớp "Điện toán" |
| REC-T-28 | I | Opt-in mặc định | User vừa đăng ký: `GET settings` → `personalizationEnabled = false`; xem/tải tài liệu → 0 dòng. Sau migration, user cũ đều `false` (G0) |
| REC-T-08 | I | Liên quan của một tài liệu AWS | Top-3 đều thuộc chủ đề AWS; không có chính nó; không có Private; mọi item có `content ≥ 0.10` |
| REC-T-09 | I | Popularity | 3 user xem X 1 lần (`raw` = 3) so với 1 user xem Y 10 lần (`raw` = 1) → `pop(X) > pop(Y)` |
| REC-T-10 | I | Chống trùng click (user đã bật) | 10 × `GET /:id` cùng user → 1 dòng; `last_at` tăng |
| REC-T-11 | I | Không ghi | Guest; chủ xem tài liệu của mình; user chưa bật; user đã tắt; tải bị ngắt giữa chừng → 0 dòng |
| REC-T-12 | I | Hết hạn | Dòng có `last_at` 91 ngày trước bị xoá khi purge; dòng 89 ngày còn |
| REC-T-13 | I | Bật / tắt | Mặc định `false` → xem không ghi; PUT `true` → xem ghi 1 dòng; PUT `false` → 0 dòng của user, home không `PERSONALIZED`, xem tiếp không ghi |
| REC-T-14 | I | Xoá lịch sử | 204; `historyItems = 0` |
| REC-T-15 | I | **Private:** dựng chỉ mục → PATCH tài liệu sang Private → gọi home, related, suggestions **khi chưa làm mới chỉ mục** | Tài liệu không xuất hiện ở cả 3 |
| REC-T-16 | I | Chủ DELETING; tài liệu vừa xoá | Không xuất hiện; tương tác của tài liệu đã xoá = 0 dòng |
| REC-T-17 | I | Phân trang `relevance` | Ghép trang 1…n (`pageSize` 5) = toàn bộ kết quả, không trùng, không thiếu; gọi lại cho cùng thứ tự; `totalItems` = `newest` |
| REC-T-18 | I | 230 kết quả (seed SQL), `pageSize` 50 | Ghép đủ 230, không trùng; trang chứa vị trí 200 đúng ranh giới; mọi tài liệu khớp tiêu đề đứng trước mọi tài liệu chỉ khớp mô tả trên toàn bộ kết quả |
| REC-T-19 | I | Lỗi ranking (hook ném lỗi khi dựng chỉ mục / khi xếp hạng) | Home 200 `NEWEST`; related `[]`; search 200 theo thứ tự SQL thô (tiêu đề trước, rồi mới nhất); có log `recommendations.fallback` |
| REC-T-20 | I | `RECOMMENDATIONS_ENABLED=false` | Như §7 spec B; 0 dòng tương tác được ghi |
| REC-T-21 | I | Suggestions | `q` 1 ký tự → `[]`; 101 ký tự → 400; ≤ 8 kết quả; không có tiêu đề trùng; chỉ Public; lần thứ 61 trong 1 phút → 429; log không chứa giá trị `q` |
| REC-T-22 | I | API-08 `sort=relevance` | 400 `INVALID_ENUM` |
| REC-T-23 | I | Hồi quy | Mọi test cũ qua; contract API-07 không đổi |
| REC-T-24 | F | Trang chủ, chi tiết, SearchBar | Mục bị ẩn khi API lỗi; lời mời bật hiện khi đăng nhập và đang tắt, không hiện với Guest; thông báo §8 hiện trước khi xác nhận bật; có `q` thì mặc định `relevance`; debounce 250 ms (fake timer); request cũ bị abort; combobox dùng được bằng bàn phím; axe không có vi phạm mới |
| REC-T-25 | B | 10 request đồng thời mỗi endpoint, chỉ mục 5 000 tài liệu | So với REC-NFR-03 (§7) |

## 5. Bộ dữ liệu đánh giá

### 5.1 DUP-EVAL — cặp tài liệu gắn nhãn cho Feature A

- **≥ 30 cặp** do owner hoặc nhóm cung cấp (DR-09), lưu ở `backend/tmp/eval/duplicates/` (gitignore) cùng `labels.json`:
  - 10 cặp **SAME**: cùng nội dung, lưu hoặc xuất lại (DOCX ↔ DOCX đổi metadata, DOCX → PDF);
  - 10 cặp **NEAR**: sửa ≤ 10% số từ;
  - 10 cặp **DIFFERENT**: cùng môn hoặc cùng mẫu (template) nhưng nội dung khác.
- Script `scripts/eval/duplicate-eval.mjs` (Agent 1) in ra `J_est` từng cặp và bảng precision/recall ở các ngưỡng 0,4 … 0,9.
- **Tiêu chí chốt ngưỡng:** ở ngưỡng chọn, **0 cặp DIFFERENT bị cảnh báo**. Recall được ghi nhận, không đặt chỉ tiêu. Ghi kết quả vào PR; không bịa số.

### 5.2 REC-EVAL — corpus tổng hợp cho Feature B

- Commit trong repo (`backend/test/fixtures/rec-eval.ts`): 30 tài liệu gồm 3 chủ đề × 10 (AWS/Cloud, AI/ML, Giải tích), tiêu đề và mô tả tiếng Việt lẫn tiếng Anh, `created_at` rải đều 60 ngày; 2–3 tài liệu Private; 1 chủ DELETING.
- Dùng cho REC-T-02…T-17. Đây là kiểm tra **tính chất** (thứ tự, loại trừ), không đo "độ chính xác gợi ý".

## 6. Cổng tích hợp

| Cổng | Khi | Phải đạt |
|---|---|---|
| **G0** | Merge Phase 0 | (a) `migrate deploy` chạy được trên DB trống; (b) chạy được trên DB ở schema baseline có dữ liệu mẫu; (c) `prisma migrate diff … --exit-code` không khác; (d) test `text-normalize`, `document.scope`; (e) mọi test cũ qua (`search()` refactor không đổi hành vi); (f) `database-schema.test.ts` kiểm 6 bảng, FK CASCADE, index mới, `personalization_enabled` mặc định `false`; (g) test `findDiscoverableByIds`, `searchRelevanceOrdered`, tham số `db?`; (h) DR-10 đã kiểm (§8.1.1) |
| **G1** | Merge Feature A | DUP-T-01…34; BENCH-A1, A2 local; DUP-EVAL có báo cáo; spike S-1 có kết quả; lint/build/CI |
| **G2** | Merge Feature B | REC-T-01…24, 26…28; BENCH-B1, B2 local; lint/build/CI |
| **G3** | Sau khi cả hai vào `main` | INT-T-01…08 (§6.1); `scripts/verify/authz-matrix.mjs`, `upload-matrix.mjs`; E2E; admin test trên máy owner (xoá tài khoản cascade) |
| **G4** | Trước khi bật trên AWS | BENCH-A1, A2, B1 chạy lại **trên một EC2 t3.micro thật** của ASG, qua đường quản trị hiện có (U-01), bằng script độc lập (không deploy nhánh chưa merge), lúc ít người dùng, owner đồng ý trước. BENCH-B2 chạy qua ALB sau rollout ở `RECOMMENDATIONS_ENABLED=true`. Smoke §8.5 |

### 6.1 Test tích hợp hai feature

| ID | Kịch bản | Tiêu chí đạt |
|---|---|---|
| INT-T-01 | Upload Public → kiểm trùng → lưu → tìm thấy bằng API-07 → có trong gợi ý sau khi làm mới chỉ mục | Đủ cả 4 bước |
| INT-T-02 | Thay tệp | `fingerprint.file_version` khớp; tài liệu vẫn có trong related/search; bytes cũ không còn gây match `EXACT` |
| INT-T-03 | Xoá tài liệu | Fingerprint 0, tương tác 0; không có ở home/related/suggestions/search |
| INT-T-04 | Đổi visibility qua lại | Không lộ ở A (DUP-T-07) lẫn B (REC-T-15) |
| INT-T-05 | Hai instance `:3000`/`:3002` chung DB | DUP-T-09; tương tác ghi qua `:3000` được hồ sơ ở `:3002` dùng ngay ở request kế tiếp |
| INT-T-06 | Migration gộp | G0 (a)–(c) lặp lại trên `main` sau khi merge cả hai |
| INT-T-07 | **App cũ trên schema mới** | Checkout baseline B0 vào worktree riêng; trỏ vào DB đã migrate; chạy `contract.test.ts` và `documents-*.test.ts` của baseline → qua (`database-schema.test.ts` cũ được phép fail vì đếm 4 bảng) |
| INT-T-08 | Hồi quy auth/upload/download | Toàn bộ CI + integration + E2E qua |

## 7. Benchmark (chưa có số đo t3.micro)

| ID | Đo gì | Cách đo | Đạt khi |
|---|---|---|---|
| BENCH-A1 | Thời gian MinHash 20 000 shingle; SHA-256 50 MiB | Script Node đo `performance.now()`, 10 lần, lấy trung vị | Ghi số; [Đo local] 164 ms và 56 ms là tham chiếu |
| BENCH-A2 | RSS và thời gian trích PDF 5 / 10 / 20 MiB (có chữ; 20 MiB chỉ để quyết định có nâng giới hạn), DOCX 10 MiB, PPTX 100 slide | `process.memoryUsage().rss` lấy mẫu mỗi 100 ms trong lúc chạy | Ở 10 MiB: RSS tăng ≤ 350 MB, xong trước 15 s. Không đạt → hạ giới hạn. Đạt cả ở 20 MiB **trên t3.micro** → được nâng |
| BENCH-A3 | Upload 10 MiB ở `off` / `warn`, 5 lần mỗi chế độ | So P95 tổng thời gian | So với DUP-NFR-04 |
| BENCH-B1 | Dựng chỉ mục 1 000 / 5 000 tài liệu thật hoặc giả (mô tả 2 000 ký tự); heap trước/sau (`--expose-gc`) | Script | ≤ 2 s; ≤ 64 MB; event loop P99 (XM-05) ≤ 50 ms trong lúc dựng |
| BENCH-B2 | 10 kết nối đồng thời, 30 s cho home / related / suggestions / search `relevance` | Công cụ thử tải trong `scripts/load/` | REC-NFR-03 |

Số đo local chỉ để so sánh tương đối; quyết định cho AWS dựa trên G4.

## 8. Triển khai

### 8.1 Local (môi trường đang dùng thật hiện nay)

Launcher tự chạy `prisma migrate deploy` khi khởi động. Quy trình:

1. `run.bat stop`
2. Sao lưu DB `btl_cloud` (mysqldump)
3. `git pull` và `npm ci`
4. Kiểm DR-10 (§8.1.1)
5. `run.bat start`
6. Chạy smoke §8.5

Mặc định `DUPLICATE_MODE=warn`.

### 8.1.1 DR-10: kiểm migration của nhánh thử nghiệm

**Chỉ đọc.** Chạy trên từng DB sẽ nhận migration Phase 0: `btl_cloud`, `btl_cloud_load`, RDS `webdb` (từ EC2, U-01). `btl_cloud_test` bỏ qua vì `global-setup` luôn `migrate reset` DB `_test`.

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM _prisma_migrations ORDER BY started_at;
SHOW TABLES LIKE 'document_fingerprints';
```

```bash
npx prisma migrate status    # trong backend/, DATABASE_URL trỏ đúng DB; chỉ đọc
```

| Trạng thái | Nhận biết | Phương án an toàn (owner quyết, chạy sau mysqldump) |
|---|---|---|
| S1 | Không có dòng `20261115000000_document_fingerprints`, không có bảng | Không làm gì. Chạy migration Phase 0 bình thường |
| S2 | Có dòng đó (`finished_at` khác NULL) **và** có bảng | Không dùng DB này cho migration mới cho tới khi owner chọn: (a) tạo DB mới từ dump **không gồm** bảng/dòng thử nghiệm rồi trỏ app sang; hoặc (b) đổi tên bảng thử nghiệm (`RENAME TABLE`, không DROP) và xử lý dòng migration lạ theo kết quả thử U-07 |
| S3 | Có dòng đó nhưng `finished_at` NULL (migration lỗi dở) | `migrate deploy` sẽ từ chối chạy. Owner chọn như S2 |
| S4 | Có bảng, không có dòng | Đổi tên bảng (không DROP), rồi chạy migration Phase 0 |

Mọi phương án (a)/(b) **diễn tập trước** trên bản restore của dump vào DB nháp (`btl_cloud_migrate_scratch`). Agent không thực hiện bước nào ở bảng này.

### 8.2 AWS: điều kiện trước

- Thực tế AWS theo [SHARED §2.3](SHARED_CONTRACTS.md#23-aws-thực-tế-bàn-giao-aws-15112026-owner-xác-nhận). Đã qua G0–G3; artifact build từ đúng commit `main` đã qua G3, trên AL2023 x86_64 như quy trình M-01, có `pdfjs-dist` trong `backend/node_modules`.
- U-01…U-05 đã được owner trả lời.
- Không cần đổi IAM: A/B chỉ đọc/ghi key tài liệu qua adapter sẵn có.
- Không cần sửa `bootstrap/app.env` cho lần đầu: mặc định `DUPLICATE_MODE=warn`, `RECOMMENDATIONS_ENABLED=true` đã nằm trong code (Phase 0).

### 8.3 AWS: thứ tự triển khai

Vì user data tải `app.tar.gz` **mỗi khi có instance mới**, migration phải xong **trước** khi thay `app.tar.gz` (R-13).

1. **Snapshot RDS** thủ công, đặt tên theo Git SHA. Snapshot chỉ để khôi phục thảm hoạ do owner quyết, không phải bước rollback.
2. **Giữ bản cũ:** sao `s3://s3bucketwebchiase/app.tar.gz` sang `releases/app-<SHA cũ hoặc ngày>.tar.gz`.
3. **Tải bản mới lên khoá có version:** `releases/app-<GIT_SHA>.tar.gz` + ghi SHA-256. Chưa đụng `app.tar.gz`.
4. **Migration một lần** trên **một** instance đang chạy, qua đường quản trị hiện có (U-01): tải `releases/app-<GIT_SHA>.tar.gz` vào thư mục tạm, không ghi đè `/opt/prj-app`; với cùng env của app (U-03), chạy `npx prisma migrate deploy` rồi `npx prisma migrate status` (U-04). Xoá thư mục tạm. App cũ vẫn chạy được trên schema mới (INT-T-07).
5. **Thay khoá boot:** sao `releases/app-<GIT_SHA>.tar.gz` → `app.tar.gz`. Từ lúc này mọi instance mới (kể cả do scale-out) chạy bản mới.
6. **Instance Refresh** `prj-app-asg`: `MinHealthyPercentage = 100`, `MaxHealthyPercentage = 200` (thêm máy mới trước khi bỏ máy cũ), `SkipMatching = false` (LT v3 không đổi nhưng vẫn phải thay máy), warmup 300 s. Trước đó kiểm suspended processes (U-05). Health check giữ `/api/health`.
7. **Trong lúc refresh:** instance cũ không ghi fingerprint hay tương tác. Đó là lý do giữ `warn`.
8. **Smoke** §8.5 qua ALB.
9. **Ghi sổ triển khai:** Git SHA, SHA-256 artifact, LT v3, thời điểm, người làm.
10. **Backfill:** lần đầu bỏ qua (RDS trống/test). Khi cần: chạy `backfill-fingerprints` từ một instance đã chạy bản mới.
11. **Bật `block`** (tuỳ owner, sau G4): sửa `DUPLICATE_MODE=block` trong `bootstrap/app.env` → Instance Refresh → smoke DUP-T-02, DUP-T-32.

### 8.4 Biến môi trường

| Biến | Bước đầu | Sau khi ổn định | Nơi đổi |
|---|---|---|---|
| `DUPLICATE_MODE` | `warn` (mặc định code) | `warn` hoặc `block` (DR-05) | `bootstrap/app.env` + Instance Refresh |
| `RECOMMENDATIONS_ENABLED` | `true` (mặc định code) | `true` | Như trên |

### 8.5 Smoke test (thủ công, ≤ 10 phút)

1. `GET /api/health` và `/api/health/ready` → 200.
2. Đăng ký 2 tài khoản test A, B.
3. A upload DOCX Public có chữ → 201, có `duplicateCheck`, `textAnalysis.status = OK`.
4. A upload lại đúng tệp → WARNING. B upload cùng tệp dạng Private → WARNING, `ownedByYou: false`.
5. A upload PDF Private; B upload cùng PDF → **không** có match.
6. B mở `GET /api/recommendations/settings` → `personalizationEnabled: false`. B mở và tải tài liệu Public của A → không ghi tương tác. B bật (PUT `true`), mở lại → home của B trả 200.
7. `GET /api/documents/<id>/related` → 200. `GET /api/recommendations/suggestions?q=<2 ký tự đầu tiêu đề>` → có tài liệu Public, không có Private.
8. `GET /api/documents?q=<từ>&sort=relevance` → 200, tài liệu khớp tiêu đề đứng đầu.
9. A xoá tài liệu → biến mất khỏi suggestions và search.
10. Ghi lại email 2 tài khoản test (RDS hiện chỉ có dữ liệu test).

### 8.6 Giám sát (không thêm dịch vụ)

- Dùng alarm sẵn có: target tracking `RequestCountPerTarget`, CPU; ASG Activity; TG health.
- Theo dõi thêm: `CPUCreditBalance` của EC2 (R-03), RDS `CPUUtilization`/`FreeableMemory`, ALB `TargetResponseTime`, `HTTPCode_Target_5XX_Count`.
- Log: nếu có CloudWatch Logs (U-02), lọc `event` bắt đầu bằng `duplicates.` hoặc `recommendations.`; nếu không, `sudo journalctl -u prj-app` trên instance.
- Phải can thiệp khi: `TIMEOUT`/`BUSY` > 20% số upload; `recommendations.index_failed` lặp lại; instance bị thay liên tục (có thể OOM khi trích PDF).

## 9. Rollback

Rollback mặc định **không** DROP bảng/cột, **không** xoá dòng `_prisma_migrations`, **không** khôi phục snapshot.

| Mức | Khi | Cách làm | Dữ liệu |
|---|---|---|---|
| R1: tắt tính năng | A hoặc B gây lỗi, tải cao, chặn nhầm | `DUPLICATE_MODE=off` và/hoặc `RECOMMENDATIONS_ENABLED=false` trong `bootstrap/app.env` → Instance Refresh | Giữ nguyên |
| R2: lùi app | Lỗi ngoài phạm vi công tắc | Sao `releases/app-<SHA cũ>.tar.gz` → `app.tar.gz` → Instance Refresh | Schema mới **giữ nguyên**; app cũ chạy được (INT-T-07); bảng mới chỉ không còn được ghi |
| Gỡ schema | Không phải rollback | Chỉ qua **CR riêng** do owner duyệt, có kế hoạch và diễn tập trên DB nháp | — |
| Khôi phục snapshot RDS | Thảm hoạ dữ liệu | **Owner quyết** từng trường hợp; làm mất mọi ghi sau snapshot | — |

- Bảng điền dở (rollout hoặc backfill dở) vẫn an toàn: thiếu fingerprint chỉ là không được so; thiếu tương tác chỉ làm gợi ý yếu hơn.
- Triển khai lại sau R2: dữ liệu cũ dùng tiếp; dòng fingerprint lệch phiên bản bị bỏ qua (INV-F1).
- Không bao giờ chạy `prisma migrate reset`, `migrate dev` hay `db push` trên DB thật.

## 10. Sẵn sàng và checklist duyệt cuối

| Hạng mục | Trạng thái | Còn chặn bởi |
|---|---|---|
| Phase 0 | Chưa làm; spec đủ | Duyệt cuối; DR-10 (§8.1.1) |
| Feature A | Sẵn sàng sau G0 | DR-09 (chỉ cho chốt ngưỡng) |
| Feature B | Sẵn sàng sau G0 | — |
| Triển khai AWS | Sau G3 | U-01…U-05, G4 |

**Checklist owner duyệt cuối** (owner tự đánh dấu):

- [ ] Decision Log ([SHARED §13.1](SHARED_CONTRACTS.md#131-decision-log-owner-chốt-16112026)) đúng ý owner.
- [ ] Quy tắc chặn DR-05 ([DUP §4.2](DUPLICATE_DETECTION_SPEC.md#42-chính-sách-theo-chế-độ)) và DUP-T-32…34.
- [ ] Opt-in: cột mặc định `false`, lời mời và thông báo ([REC §8](HYBRID_RECOMMENDATION_SPEC.md#8-riêng-tư-và-quyền-kiểm-soát-b6)), chấp nhận R-12.
- [ ] Xếp hạng `level` ([REC §5.3–5.4](HYBRID_RECOMMENDATION_SPEC.md#53-truy-vấn-luôn-thắng-cá-nhân-hoá)) và giới hạn ngoài top-200.
- [ ] `pdfjs-dist@6.5.438`, PDF ≤ 10 MiB.
- [ ] Phase 0 và danh sách file đóng băng ([SHARED §8–9](SHARED_CONTRACTS.md#8-phase-0--nền-móng-điều-kiện-tiên-quyết)); ai làm Phase 0.
- [ ] Thứ tự triển khai §8.3 và rollback §9.
- [ ] Danh sách chưa kiểm chứng U-01…U-09 ([SHARED §13.2](SHARED_CONTRACTS.md#132-vấn-đề-chưa-kiểm-chứng)) và người trả lời.
- [ ] Hai prompt agent ([AGENT_1](AGENT_1_IMPLEMENTATION_PROMPT.md), [AGENT_2](AGENT_2_IMPLEMENTATION_PROMPT.md)).
- [ ] Khi duyệt: ghi CR mới vào MILESTONES, sửa PROJECT_OVERVIEW §2, merge `docs/features/` vào `main`.
