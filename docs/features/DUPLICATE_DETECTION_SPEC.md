# DUPLICATE_DETECTION_SPEC — Feature A: Phát hiện tài liệu trùng hai lớp

> **Trạng thái: ĐÃ DUYỆT CÓ ĐIỀU KIỆN (16/11/2026), chờ duyệt cuối. Chưa triển khai.** Người làm: **Implementation Agent 1** (sau Phase 0).
> Phải đọc trước: [SHARED_CONTRACTS](SHARED_CONTRACTS.md) (schema, Phase 0, predicate quyền, sở hữu file). Test và rollout ở [ACCEPTANCE_AND_ROLLOUT](ACCEPTANCE_AND_ROLLOUT.md).
> Ký hiệu [Đã kiểm] / [Đo local] / [Giả định] / [Cần đo] như SHARED_CONTRACTS.

## 1. Mục tiêu và phạm vi

- **Lớp 1 (SHA-256):** phát hiện tệp **giống hệt từng byte**. Ở chế độ `block` thì từ chối upload; ở `warn` thì cảnh báo.
- **Lớp 2 (nội dung chữ):** trích chữ có sẵn trong PDF/DOCX/PPTX, chuẩn hoá, tạo shingle 5 từ và MinHash 128 giá trị, rồi ước lượng độ tương đồng Jaccard. Lớp này **chỉ cảnh báo**, không bao giờ chặn hay xoá.
- Áp dụng cho upload (API-10) và thay tệp (API-12).

**Ngoài phạm vi:** OCR, PDF chỉ có ảnh, so sánh ngữ nghĩa/diễn đạt lại, so sánh ảnh, tự xoá tài liệu, kiểm trùng khi PATCH đổi visibility (DR-13), chỉ mục LSH.

## 2. Hiện trạng liên quan [Đã kiểm]

| Hiện trạng | Nơi | Hệ quả cho A |
|---|---|---|
| Upload: multer → validate → `inspectFile` → PutObject → INSERT → xoá tmp trong `finally` (U1–U7, [§A6.3](../ARCHITECTURE.md#a63-upload-api-10)) | `documents.controller.ts`, `documents.service.ts` | A chèn bước giữa `inspectFile` và PutObject, rồi ghi fingerprint trong cùng transaction với INSERT |
| Thay tệp: PutObject(key mới) → `UPDATE … file_version + 1` → xoá key cũ; hai lần thay đồng thời thì lần sau thắng | `replaceFile` | Fingerprint cập nhật trong cùng transaction với `UPDATE` |
| `inspectFile` đọc central directory ZIP bằng `yauzl`, đòi magic `PK\x03\x04` | `file-inspector.ts` | DOCX/PPTX **mã hoá bằng mật khẩu** là container OLE, không phải ZIP, nên **đã bị 415 từ trước**. A không xử lý loại này |
| `yauzl` 3.4.0 đã là dependency; **chưa có thư viện PDF** | `backend/package.json` | Cần `pdfjs-dist` (DR-02) |
| Không có transaction trong `create`/`replaceFile`; `createTransactionRunner` có sẵn nhưng chỉ `AuthService` dùng | `container.ts`, `db/prisma.ts` | A truyền `runInTransaction` (hoặc `prisma.$transaction` có `isolationLevel`) vào `DocumentService` |
| Test upload lặp lại cùng bytes `pdfBuffer()`; contract test `.strict()` | `test/integration/context.ts`, `test/helpers/contract.ts` | Mặc định `warn`; thêm `uploadResultSchema` |
| Nhánh thử nghiệm chưa nối, MinHash chưa kiểm, trả 0 khi thiếu dữ liệu | [SHARED §2.3](SHARED_CONTRACTS.md#24-nhánh-thử-nghiệm-featuredocument-duplicate-guard-mvp-đã-kiểm) | Viết lại theo spec này |

## 3. Tổng quan luồng

```mermaid
sequenceDiagram
  autonumber
  participant C as Controller (API-10/12)
  participant D as DuplicateService
  participant W as Worker trích chữ
  participant S as S3
  participant DB as RDS
  C->>D: inspect(file, uploader, excludeId?)
  D->>D: SHA-256 theo stream (luôn chạy)
  alt mode ≠ off
    D->>DB: Kiểm trùng chính xác trong phạm vi (sha256)
    alt block và có match chặn được (§4.2)
      D-->>C: 409 DUPLICATE_DOCUMENT (chưa ghi S3)
    end
    par
      C->>S: PutObject(key mới)
    and
      D->>W: trích chữ, deadline 15 s
      W-->>D: words | SKIPPED(lý do)
    end
    D->>D: shingle → MinHash
    D->>DB: text_sha256 + quét MinHash có giới hạn
  else mode = off
    C->>S: PutObject
  end
  C->>DB: TRANSACTION READ COMMITTED<br/>[block: SELECT users FOR UPDATE + kiểm lại sha256]<br/>INSERT/UPDATE documents + UPSERT fingerprint
  alt block và lần kiểm lại thấy match chặn được
    DB-->>C: rollback → xoá object vừa ghi → 409
  end
  C-->>C: 201/200 + duplicateCheck; finally xoá tmp
```

## 4. Lớp 1 — SHA-256

### 4.1 Tính toán và lưu

- **DUP-FR-001:** Tính SHA-256 trên tệp tạm bằng `createReadStream` + `createHash('sha256')`, đúng một lần cho mỗi request, **ở mọi chế độ** (kể cả `off`). RAM không tăng theo kích thước tệp. [Đo local] 50 MiB tốn khoảng 56 ms CPU, chưa tính đọc đĩa.
- **DUP-FR-002:** Lưu `sha256` (64 ký tự hex thường) vào `document_fingerprints` trong **cùng transaction** với INSERT `documents` (upload) hoặc `UPDATE documents` (thay tệp), kèm `file_version` mới (INV-F1).
- **DUP-FR-003:** Tra trùng bằng index `idx_document_fingerprints_sha256`, trong phạm vi `duplicateScopeSql(uploaderId)`, loại tài liệu đang được thay (`d.id <> :excludeId`). Chỉ tính dòng có `f.file_version = d.file_version`. Lấy tối đa 5 kết quả, tài liệu của mình trước, sau đó theo `d.created_at DESC, d.id DESC`.

```sql
SELECT d.id, d.title, d.visibility, d.owner_id
FROM document_fingerprints f
JOIN documents d ON d.id = f.document_id AND d.file_version = f.file_version
WHERE f.sha256 = :sha AND (d.owner_id = :uploader OR <discoverableSql>) AND d.id <> :excludeId
ORDER BY (d.owner_id = :uploader) DESC, d.created_at DESC, d.id DESC
LIMIT 5;
```

### 4.2 Chính sách theo chế độ

| `DUPLICATE_MODE` | Có trùng chính xác | Không trùng |
|---|---|---|
| `off` | Không kiểm, không báo. Vẫn lưu `sha256`; `text_status = SKIPPED`, `text_reason = DISABLED`; không chạy Lớp 2 | 201/200 |
| `warn` (mặc định) | 201/200, `duplicateCheck.result = "WARNING"`, có `exactMatches` | 201/200 `ACCEPT` |
| `block` | Có ít nhất 1 match **chặn được** → **409 `DUPLICATE_DOCUMENT`**; không tạo, không đổi tài liệu, object mới (nếu đã ghi) bị xoá best-effort. Chỉ có match không chặn được → như `warn` | 201/200 |

**Quy tắc chặn (DR-05, đã chốt).** Gọi `newVisibility` là visibility của tệp sau khi lưu: upload lấy từ form; thay tệp lấy visibility **hiện tại** của tài liệu. Một match `m` (đã nằm trong `duplicateScopeSql`) là **chặn được** khi:

```text
m.ownedByYou                                   // bản của chính mình, mọi visibility
OR (m.visibility = PUBLIC AND newVisibility = PUBLIC)   // Public người khác, và tệp mới cũng Public
```

Bản sao **PRIVATE** của tài liệu Public người khác: không chặn, chỉ `WARNING`. Phạm vi **cảnh báo** không đổi (của mình + discoverable).

### 4.3 Ma trận tình huống

| Tình huống | `warn` | `block` | Ghi chú riêng tư |
|---|---|---|---|
| Cùng bytes, khác tên tệp | WARNING | 409 | Tên tệp không tham gia |
| Cùng tên tệp, khác bytes | Không trùng chính xác (Lớp 2 có thể cảnh báo) | Như `warn` | — |
| Cùng user upload lại tệp của mình (Public hoặc Private) | WARNING, `ownedByYou: true` | 409 | Lộ tiêu đề của **chính mình**: chấp nhận |
| User B upload tệp trùng tài liệu **Private** của A | ACCEPT, không có match | ACCEPT | Private của người khác không bao giờ được so, nên response giống hệt tệp không trùng |
| User B upload tệp **PUBLIC** trùng tài liệu **Public** của A | WARNING, `ownedByYou: false` | 409 | Tài liệu đã Public: được lộ id và tiêu đề |
| User B upload tệp **PRIVATE** trùng tài liệu **Public** của A | WARNING, `ownedByYou: false` | **WARNING (201)** | Như trên |
| A đổi tài liệu Public → Private, sau đó B upload tệp trùng | ACCEPT | ACCEPT | Phạm vi được tính lúc truy vấn |
| Chủ tài liệu trùng đang DELETING | Không tính | Không tính | Predicate §6.2 |
| Thay tệp X bằng bytes giống hệt bản hiện tại của X | ACCEPT (loại chính X) | ACCEPT | — |
| Thay tệp X bằng bytes trùng tài liệu Y của mình | WARNING | 409; X giữ nguyên `file_version`, key cũ | — |
| Thay tệp X (của B) bằng bytes trùng tài liệu Public của A | WARNING | X **PUBLIC** → 409; X **PRIVATE** → WARNING (200) | — |
| Hai request của **cùng user**, cùng bytes, tới 2 EC2 khác nhau cùng lúc | Cả hai 201 + WARNING khi kịp thấy nhau (có thể không thấy) | **Đúng 1** thành công, request kia nhận 409 (§4.4) | — |
| Hai user khác nhau upload cùng một tệp PUBLIC đồng thời | Có thể cả hai không thấy nhau | **Có thể lọt cả hai** (DR-07) | — |
| Tài liệu cũ chưa có fingerprint | Không được so cho tới khi backfill (§4.7) | Như `warn` | — |

### 4.4 Đồng thời giữa nhiều instance

Kiểm bằng `SELECT` trước khi ghi S3 **không đủ**. Giữa lúc kiểm và lúc INSERT là cả thời gian PutObject, có thể vài giây. Cách xử lý ở chế độ `block`:

1. **Kiểm sớm** (trước PutObject, không khoá) để tránh ghi S3 vô ích.
2. **Kiểm quyết định** trong transaction `READ COMMITTED`, ngay trước INSERT/UPDATE:
   ```text
   BEGIN (isolationLevel = READ COMMITTED)
     SELECT id FROM users WHERE id = :uploader FOR UPDATE   -- khoá dòng user trên RDS dùng chung
     <truy vấn §4.1>                                          -- READ COMMITTED: thấy dữ liệu đã commit
     nếu có match chặn được (§4.2) → ROLLBACK → xoá object mới (best-effort) → 409
     INSERT documents / UPDATE documents; UPSERT document_fingerprints
   COMMIT
   ```
   Hai request cùng user sẽ xếp hàng ở dòng `users`. Request sau chỉ đọc sau khi request trước đã commit, nên thấy fingerprint của nó. Cơ chế dựa vào khoá InnoDB trên RDS dùng chung, nên **đúng với mọi số lượng EC2**.
3. Transaction chỉ gồm vài câu lệnh (mục tiêu < 100 ms). Không giữ transaction trong lúc PutObject hay trích chữ.
4. **Đánh đổi:** không khoá giữa **các user khác nhau** (DR-07). Muốn chặn tuyệt đối thì cần thêm bảng khoá theo `sha256`. MVP không làm vì rất hiếm và hậu quả chỉ là hai bản Public giống nhau.
5. Chế độ `warn`/`off`: transaction **không** khoá dòng `users`, chỉ ghi document + fingerprint.

Không dùng unique index toàn cục trên `sha256`: nó sẽ chặn cả bản sao Private hợp lệ của user khác và biến DB thành "oracle" dò xem ai đó có tệp hay không.

### 4.5 Xoá, đổi visibility, xoá user

| Hành động | Hành vi |
|---|---|
| Xoá tài liệu | Fingerprint bị xoá theo (CASCADE). Upload lại tệp đó → ACCEPT |
| Đổi visibility (API-11) | Không kiểm trùng (DR-13); fingerprint không đổi; phạm vi so trùng tự thay đổi |
| Xoá tài khoản (admin) | CASCADE qua `documents`; không sửa mã admin |
| User DELETING | Tài liệu bị loại khỏi phạm vi; user đó không upload được (phiên đã bị xoá) |

### 4.6 Nhất quán S3/RDS và lỗi

| Điểm lỗi | Kết quả | Dữ liệu |
|---|---|---|
| Đọc tmp/SHA-256 lỗi | 500 `INTERNAL_ERROR` (`stage: "inspect"`) | Chưa ghi gì |
| Kiểm sớm lỗi DB | 500 (`stage: "db"`) như lỗi DB hiện tại | Chưa ghi S3 |
| PutObject lỗi | 503 `STORAGE_UNAVAILABLE` (như hiện tại); kết quả Lớp 2 bị bỏ | Không có dòng |
| Lớp 2 lỗi (trích chữ, tra MinHash) | **Không làm hỏng upload**; `textAnalysis.status = SKIPPED` với lý do tương ứng | Fingerprint vẫn lưu `sha256` |
| Transaction lỗi hoặc 409 ở lần kiểm lại | Xoá object mới best-effort (lỗi → WARN `storage.orphan`), trả lỗi gốc / 409 | Không có dòng nào (rollback) |
| Crash sau PutObject, trước COMMIT | Object mồ côi (đã chấp nhận ở [§A11](../ARCHITECTURE.md#a11-hạn-chế-đã-chấp-nhận)) | Không có dòng |
| Tệp tạm | Service phải **chờ worker kết thúc hoặc bị terminate** trước khi trả về, để `finally` xoá được tmp (trên Windows tệp đang mở không xoá được) | — |

### 4.7 Tài liệu cũ chưa có fingerprint (backfill)

- **DUP-FR-040:** Script `backend/scripts/backfill-fingerprints.ts`, chạy **thủ công**, không chạy lúc khởi động. Script chọn tài liệu chưa có fingerprint, hoặc có `algo_version` cũ, hoặc `text_reason ∈ {DISABLED, BUSY, TIMEOUT}`. Với từng tài liệu: tải object về tmp → tính như upload → UPSERT **chỉ khi** `documents.storage_key` vẫn là key đã tải (tránh ghi đè lên bản vừa được thay). Mỗi lần chạy 1 tài liệu; có thể dừng giữa chừng và chạy lại (idempotent). Không xoá gì.
- Trên AWS: chạy thủ công từ một EC2 **đang chạy bản mới** (sau instance refresh), qua đường quản trị hiện có (U-01), với env của app (DR-11). RDS hiện trống hoặc chỉ có dữ liệu test nên lần triển khai đầu **không cần backfill**.

## 5. Lớp 2 — Trích chữ

### 5.1 Thư viện

| Định dạng | Cách trích | Ghi chú |
|---|---|---|
| DOCX | `yauzl` đọc `word/document.xml`; lấy nội dung `<w:t …>…</w:t>`; chèn khoảng trắng tại `</w:p>`, `<w:tab/>`, `<w:br/>`; giải mã 5 entity có tên và entity số | Header, footer, footnote: ngoài MVP |
| PPTX | `yauzl` đọc `ppt/slides/slide<N>.xml`, sắp theo **N dạng số** (không theo thứ tự trong ZIP); lấy `<a:t>`; khoảng trắng tại `</a:p>` | Notes: ngoài MVP |
| PDF | `pdfjs-dist` **6.5.438** pin chính xác (DR-02); entry cho Node do spike S-1 chốt (thử `pdfjs-dist/legacy/build/pdf.mjs` trước); `getDocument({ data, isEvalSupported: false, disableFontFace: true, useSystemFonts: false })`; với mỗi trang, nối `items[].str` bằng khoảng trắng | Không render, không canvas, không dùng `@napi-rs/canvas` |

Phân tích XML bằng regex trên chuỗi đã giới hạn kích thước là đủ, vì chỉ lấy text node và không cần cây DOM. Không thêm thư viện XML.

### 5.2 Giới hạn (hằng số trong `duplicate.policy.ts`)

| Mục | Giá trị | Vượt thì |
|---|---|---|
| Số từ tối đa | 20 000 (sau `tokenize`) | Dừng, `PARTIAL / WORD_LIMIT` |
| Số từ tối thiểu | 50 | `SKIPPED / INSUFFICIENT_TEXT` |
| PDF: kích thước được phân tích | ≤ 10 MiB (t3.micro 1 GiB; chỉ nâng sau BENCH-A2 trên EC2 thật) | `SKIPPED / TOO_LARGE` (vẫn có SHA-256) |
| PDF: số trang | 100 trang đầu | `PARTIAL / PAGE_LIMIT` |
| DOCX/PPTX: số slide | 300 slide đầu | `PARTIAL / PART_LIMIT` |
| DOCX/PPTX: byte XML **đã giải nén** mỗi phần / tổng | 10 MiB / 32 MiB, đếm byte thật khi stream (không tin `uncompressedSize`; giữ `validateEntrySizes` mặc định của yauzl) | Dừng đọc, giữ chữ đã có: `PARTIAL / PART_LIMIT` |
| Thời gian (gồm cả chờ hàng đợi) | 15 s | `worker.terminate()`, `SKIPPED / TIMEOUT` |
| Đồng thời | 1 job/instance; hàng đợi tối đa 3 | Hàng đợi đầy: `SKIPPED / BUSY` |
| Heap worker | `resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 }` [Cần đo] | Worker chết: `SKIPPED / ERROR` |

### 5.3 Chạy cô lập

- **DUP-FR-020:** Trích chữ, chuẩn hoá và tính MinHash chạy trong `worker_threads`, **mỗi job một worker mới**. Worker nhận đường dẫn tmp (không chuyển 50 MiB qua message) và trả về `{ status, reason, words?: string[] }` hoặc trực tiếp `{ shingleCount, minhash, textSha256 }`.
- Parser treo, ném lỗi hay tràn heap chỉ giết **worker**, không giết process. Timeout dùng `worker.terminate()`; event loop chính không bị chặn.
- Spike S-1 (task đầu tiên): kiểm worker chạy được trong `tsx watch` (dev), vitest và `dist/` (production). Nếu `.ts` không nạp được trong worker, dùng entry `.js` biên dịch sẵn. Ghi kết quả vào PR.

### 5.4 Trạng thái và lý do

| `text_status` | `text_reason` | Ý nghĩa với người dùng |
|---|---|---|
| `OK` | `null` | Đã phân tích hết phần chữ |
| `PARTIAL` | `WORD_LIMIT` · `PAGE_LIMIT` · `PART_LIMIT` | Chỉ phân tích phần đầu; độ tương đồng có thể **thấp hơn thực tế** |
| `SKIPPED` | `DISABLED` · `TOO_LARGE` · `ENCRYPTED` · `MALFORMED` · `INSUFFICIENT_TEXT` · `TIMEOUT` · `BUSY` · `UNSUPPORTED` · `ERROR` | **Chưa kiểm trùng nội dung.** Tuyệt đối không hiển thị như "0%" hay "không trùng" |

- PDF có mật khẩu mở (`PasswordException`) → `ENCRYPTED`. PDF chỉ có mật khẩu quyền hạn vẫn đọc được chữ.
- PDF hỏng (`InvalidPDFException`) → `MALFORMED`. Upload **vẫn** thành công, vì `inspectFile` chỉ kiểm magic bytes.
- PDF scan hoặc ảnh: thường trả về < 50 từ → `INSUFFICIENT_TEXT`.

### 5.5 Tiếng Việt

- Chuẩn hoá bằng `tokenize()` của [SHARED §6.1](SHARED_CONTRACTS.md#61-backendsrclibtext-normalizets-hàm-thuần-không-io): NFKC + chữ thường, **giữ dấu**. Ví dụ "Điện Toán ĐÁM MÂY" → `điện toán đám mây`.
- **Giới hạn đã biết:** PDF dùng font cũ (TCVN3/VNI) hoặc thiếu bảng ToUnicode cho ra chữ sai mã. Hai bản sao của **cùng** PDF vẫn so khớp được với nhau vì sai giống nhau, nhưng so PDF với DOCX thì không.

## 6. Shingling + MinHash

### 6.1 Tham số (phiên bản thuật toán `algo_version = 1`)

| Tham số | Giá trị |
|---|---|
| Shingle | 5 từ liên tiếp, nối bằng 1 khoảng trắng; dùng **tập** (bỏ trùng) |
| Số hàm băm | K = 128 |
| Số nguyên tố | P = 2³¹ − 1 = 2 147 483 647 |
| Họ hàm | hᵢ(x) = (aᵢ·x + bᵢ) mod P (họ hàm băm phổ quát, cùng dạng với thư viện `datasketch` của Python) |
| Hạt giống | Cố định, sinh từ nhãn `btl-minhash-v1:a:i` / `btl-minhash-v1:b:i`, không ngẫu nhiên lúc chạy |

### 6.2 Pseudocode (chuẩn để implement)

```text
u32(s)  = 4 byte đầu của SHA-256(UTF-8(s)), đọc big-endian
A[i]    = u32("btl-minhash-v1:a:" + i) mod (P − 1) + 1        // 1..P−1, i = 0..127
B[i]    = u32("btl-minhash-v1:b:" + i) mod P                  // 0..P−1

mulAddMod(a, x, b):                     // (a·x + b) mod P, tính CHÍNH XÁC bằng float64
  a1 = floor(a / 65536); a0 = a mod 65536            // a1 < 2^15, a0 < 2^16
  hi = ((a1 · x) mod P) · 65536 mod P               // a1·x < 2^46, hi·65536 < 2^47
  return (hi + a0 · x + b) mod P                    // tổng < 2^48 < 2^53: không mất chính xác

signature(text):
  { tokens: W, truncated } = tokenize(text, { maxTokens: 20000 })
  if |W| < 50 → SKIPPED(INSUFFICIENT_TEXT)
  S = { W[j] + " " + … + " " + W[j+4] | j = 0 … |W| − 5 }          // tập
  sig[0..127] = P                                                   // P lớn hơn mọi giá trị hᵢ
  for s in S:
    x = u32(s) mod P
    for i in 0..127:
      v = mulAddMod(A[i], x, B[i]); if v < sig[i]: sig[i] = v
  minhash      = 128 × uint32 big-endian (512 byte)
  shingleCount = |S|
  textSha256   = truncated ? null : SHA-256(W.join(" "))            // chỉ khi status = OK
  status       = truncated hoặc chạm giới hạn trang/phần ? PARTIAL : OK

estimate(sigA, sigB) = (số i có sigA[i] = sigB[i]) / 128
```

### 6.3 Kiểm chứng thống kê [Đo local]

Script kiểm nhanh (không thuộc repo) dựng các cặp tập có Jaccard J biết trước (400 phần tử, 60 cặp mỗi mức) và so ước lượng với J thật:

| J thật | Độ lệch trung bình | Sai số tuyệt đối TB | SE lý thuyết √(J(1−J)/128) |
|---|---|---|---|
| 0,3 | +0,003 | 0,032 | 0,041 |
| 0,5 | −0,005 | 0,033 | 0,044 |
| 0,6 | +0,009 | 0,030 | 0,043 |
| 0,7 | +0,001 | 0,032 | 0,041 |
| 0,8 | +0,007 | 0,030 | 0,035 |
| 0,9 | +0,001 | 0,022 | 0,027 |

- Không thấy lệch hệ thống. Sai số tuyệt đối trung bình xấp xỉ 0,8 × SE, khớp với phân phối gần chuẩn. Họ (ax+b) mod P chỉ **xấp xỉ** min-wise independent, nên DUP-T-19 phải lặp lại phép kiểm này như test tự động.
- `mulAddMod` khớp với phép tính BigInt trên 10 000 mẫu (0 sai lệch).
- Chi phí: 20 000 shingle × 128 hàm tốn khoảng **164 ms** (bản BigInt với P = 2⁶¹−1 tốn 840 ms nên bị loại). Băm cơ sở 20 000 shingle tốn 50 ms. Trên t3.micro: [Cần đo, BENCH-A1].

### 6.4 Lưu trữ

512 byte (`minhash`) + 64 (`sha256`) + 64 (`text_sha256`) + vài cột nhỏ ≈ **0,7 KB/tài liệu** cộng overhead index. 10 000 tài liệu ≈ 7 MB.

### 6.5 Tìm ứng viên (có giới hạn)

1. **Trùng chữ hoàn toàn** (không phụ thuộc giới hạn ứng viên): tra `text_sha256 = :h` khi tệp mới có `text_status = OK`, trong phạm vi, loại `excludeId`, tối đa 5. Kết quả: `matchType = "SAME_TEXT"`, `similarity = 1`.
2. **Quét MinHash có giới hạn:**
   ```sql
   SELECT f.document_id, f.minhash, d.title, d.visibility, d.owner_id
   FROM document_fingerprints f
   JOIN documents d ON d.id = f.document_id AND d.file_version = f.file_version
   WHERE f.algo_version = 1 AND f.text_status IN ('OK','PARTIAL')
     AND f.shingle_count BETWEEN CEIL(:n * 0.5) AND FLOOR(:n / 0.5)
     AND (d.owner_id = :uploader OR <discoverableSql>) AND d.id <> :excludeId
   ORDER BY d.created_at DESC, d.id DESC
   LIMIT 2001;                                -- lấy 2001 để biết có bị cắt không
   ```
   - **Bộ lọc độ dài là chặt về toán học:** J(A,B) ≤ min(|A|,|B|) / max(|A|,|B|). Cặp có tỉ lệ kích thước < 0,5 chắc chắn có J thật < 0,5, mà 0,5 thấp hơn ngưỡng cảnh báo 0,6 khoảng 2,3 SE. Bộ lọc này gần như không gây bỏ sót thêm.
   - Tính `estimate` cho ≤ 2000 ứng viên (≈ 256 000 phép so, khoảng 1 MB đọc từ DB). Giữ những cặp ≥ ngưỡng, tối đa 5, sắp giảm dần theo độ tương đồng.
   - **Bỏ sót do giới hạn:** nếu có hơn 2000 ứng viên hợp lệ (cùng dải kích thước), tài liệu cũ hơn không được so. Khi đó response có `candidatesTruncated: true`. Với quy mô học phần (vài trăm tới vài nghìn tài liệu), trường hợp này hiếm. Nếu lớn hơn: thêm bảng LSH band (ngoài MVP).

### 6.6 Độ phức tạp và hạn chế

- Thời gian: O(W) tách từ + O(|S|·128) chữ ký + O(C·128) so sánh, với C ≤ 2000. Bộ nhớ: tập shingle ≤ 20 000 chuỗi trong worker.
- **Hạn chế:** chỉ so trên bề mặt chữ. Không nhận ra diễn đạt lại hay bản dịch. Đổi thứ tự đoạn chỉ làm giảm J ở chỗ nối giữa các đoạn. Cứ mỗi từ bị sửa thì tối đa 5 shingle thay đổi (sửa 1 từ/20 từ có thể kéo J xuống khoảng 0,6). PDF ↔ DOCX cùng nội dung thường có J thấp hơn vì header, footer, ngắt dòng và gạch nối. Tài liệu ngắn (< 50 từ) bị bỏ qua. Tài liệu `PARTIAL` chỉ so phần đầu.
- **Đổi thuật toán** (tham số, hạt giống, `tokenize`) → tăng `algo_version`. Chỉ so các dòng cùng phiên bản; dòng cũ được backfill lại.

## 7. Quyết định trùng

| Kết quả | Điều kiện | Hành động |
|---|---|---|
| `EXACT` | Trùng `sha256` trong phạm vi | `block` + match chặn được (§4.2) → 409; còn lại → WARNING |
| `SAME_TEXT` | Trùng `text_sha256` (cả hai `OK`) | WARNING (không bao giờ chặn) |
| `SIMILAR_TEXT` | `estimate ≥ NEAR_THRESHOLD` | WARNING |
| `SKIPPED` | Lớp 2 không có chữ ký | Báo "chưa kiểm trùng nội dung" + lý do; vẫn ACCEPT |
| `ACCEPT` | Không có gì ở trên | — |

`NEAR_THRESHOLD = 0.6` là **giá trị tạm thời**, chưa được hiệu chỉnh. Phải chốt lại sau khi chạy bộ đánh giá gắn nhãn (DUP-EVAL, [ACCEPTANCE §5.1](ACCEPTANCE_AND_ROLLOUT.md#51-dup-eval--cặp-tài-liệu-gắn-nhãn-cho-feature-a)). Ngưỡng nằm trong `duplicate.policy.ts`, không phải env.

## 8. Hợp đồng API

### 8.1 API-10 / API-12: response thành công (thay đổi chỉ thêm)

`data` = `DocumentDto` (giữ nguyên mọi trường) **+** trường `duplicateCheck`. Status 201/200 và header không đổi.

```ts
interface DuplicateCheckDto {
  mode: 'off' | 'warn' | 'block';
  result: 'ACCEPT' | 'WARNING';                 // 2xx không bao giờ có BLOCK
  exactMatches: DuplicateMatchDto[];             // tối đa 5; [] khi mode = off
  textMatches: DuplicateMatchDto[];              // SAME_TEXT trước, rồi SIMILAR_TEXT; tối đa 5
  textAnalysis: {
    status: 'OK' | 'PARTIAL' | 'SKIPPED';
    reason: string | null;                        // theo §5.4
    candidatesScanned: number;                    // 0 khi SKIPPED
    candidatesTruncated: boolean;
  };
}
interface DuplicateMatchDto {
  documentId: string;                             // luôn là tài liệu người gọi được phép xem
  title: string;
  visibility: 'PUBLIC' | 'PRIVATE';               // PRIVATE chỉ khi ownedByYou = true
  ownedByYou: boolean;
  matchType: 'EXACT' | 'SAME_TEXT' | 'SIMILAR_TEXT';
  similarity: number;                             // 0..1, làm tròn 2 chữ số; EXACT/SAME_TEXT = 1
}
```

- `result = "WARNING"` khi `exactMatches` hoặc `textMatches` khác rỗng.
- **Bất biến riêng tư:** mọi `documentId` trong response đều qua được `canView(doc, uploader)`. Mọi match có `ownedByYou = false` đều là PUBLIC.

### 8.2 409 `DUPLICATE_DOCUMENT` (chỉ khi `block`)

Envelope lỗi chuẩn ([§A7.2](../ARCHITECTURE.md#a72-envelope)), **thêm** khoá `duplicates` chỉ cho mã này. `duplicates` chỉ gồm các match **chặn được** (≤ 5); đường ống in khoá này đã có từ Phase 0:

```json
{
  "error": {
    "code": "DUPLICATE_DOCUMENT",
    "message": "Tệp này trùng hoàn toàn với một tài liệu đã có.",
    "details": [],
    "requestId": "…",
    "duplicates": [
      { "documentId": "…", "title": "Đề cương Giải tích 1", "visibility": "PUBLIC", "ownedByYou": false, "matchType": "EXACT", "similarity": 1 }
    ]
  }
}
```

- Audit: `DOCUMENT_UPLOAD`/`DOCUMENT_REPLACE` ghi `FAILURE` kèm `errorCode = DUPLICATE_DOCUMENT` theo cơ chế sẵn có. Không thêm khoá metadata.
- Thứ tự kiểm không đổi: 401/403/404/400/413/415 vẫn xảy ra trước 409.

### 8.3 Log (không chứa tiêu đề, tên tệp, chữ trích ra)

| `event` | Mức | Trường |
|---|---|---|
| `duplicates.check` | info | `mode`, `result`, `exactCount`, `textCount`, `textStatus`, `textReason`, `candidatesScanned`, `durationMs` |
| `duplicates.text_skipped` | warn khi `TIMEOUT`/`BUSY`/`ERROR`; debug khi còn lại | `reason`, `fileType`, `sizeBytes` |
| `duplicates.blocked` | info | `documentId` của match (không có tiêu đề) |

## 9. Frontend (Agent 1)

- `api/duplicates.ts`: kiểu `DuplicateCheckDto`, `DuplicateMatchDto`. `ApiError` giữ thêm `duplicates` khi `code = DUPLICATE_DOCUMENT`.
- **UploadPage** và **thay tệp ở EditDocumentPage**:
  - 409: báo lỗi trong form: "Tệp này trùng hoàn toàn với:" kèm danh sách link `/documents/:id` (nhãn "của bạn" hoặc "công khai"). Form và các trường đã nhập được giữ nguyên.
  - 2xx + `WARNING`: vẫn chuyển trang như hiện tại, kèm thông báo "Đã tải lên. Lưu ý: tệp trùng/gần giống với…" và các link. Độ tương đồng hiển thị dạng "khoảng 72% nội dung chữ trùng". Thêm "(chỉ phân tích phần đầu)" khi `PARTIAL`.
  - `textAnalysis.status = SKIPPED` và `mode ≠ off`: một dòng phụ "Chưa kiểm tra được trùng nội dung: <lý do tiếng Việt>". **Không** hiển thị con số %.
- `lib/errorMessages.ts`: thêm `DUPLICATE_DOCUMENT` và câu tiếng Việt cho từng `reason`.

## 10. Yêu cầu chức năng

| ID | Yêu cầu |
|---|---|
| DUP-FR-001…003 | §4.1 |
| DUP-FR-004 | Chế độ `off`/`warn`/`block` đúng §4.2; mặc định `warn` |
| DUP-FR-005 | Phạm vi so trùng **luôn** là `duplicateScopeSql`; không có đường code nào so với Private của người khác |
| DUP-FR-006 | `block`: kiểm sớm trước PutObject và kiểm lại trong transaction có khoá dòng `users` (§4.4); chỉ chặn theo quy tắc §4.2 |
| DUP-FR-007 | Fingerprint ghi cùng transaction với document (INV-F1); thay tệp UPSERT với `file_version` mới |
| DUP-FR-008 | 409 không để lại dòng nào; object mới bị xoá best-effort |
| DUP-FR-020 | Lớp 2 chạy trong worker với các giới hạn §5.2 |
| DUP-FR-021 | DOCX/PPTX/PDF trích theo §5.1; slide sắp theo số |
| DUP-FR-022 | Trạng thái/lý do theo §5.4; `SKIPPED` không bao giờ hiển thị là 0% |
| DUP-FR-023 | MinHash đúng §6.2; chữ ký giống hệt nhau giữa các lần chạy, process và máy |
| DUP-FR-024 | Đổi thuật toán → tăng `algo_version`; chỉ so cùng phiên bản |
| DUP-FR-025 | Tìm ứng viên theo §6.5; báo `candidatesTruncated` |
| DUP-FR-026 | `text_sha256` chỉ khi `OK` |
| DUP-FR-030 | Response §8.1; lỗi §8.2 |
| DUP-FR-031 | Frontend §9 |
| DUP-FR-040 | Backfill §4.7 |
| DUP-FR-041 | Lỗi Lớp 2 không bao giờ làm upload thất bại |

## 11. Yêu cầu phi chức năng

| ID | Yêu cầu | Loại |
|---|---|---|
| DUP-NFR-01 | Tối đa 1 job trích chữ đồng thời / instance; hàng đợi ≤ 3; deadline 15 s | Giới hạn cứng |
| DUP-NFR-02 | Event loop chính không bị chặn > 50 ms bởi A | Mục tiêu, đo bằng metric event loop P99 sẵn có (XM-05) |
| DUP-NFR-03 | RSS process tăng ≤ 350 MB khi trích PDF 10 MiB | [Cần đo] BENCH-A2 |
| DUP-NFR-04 | Thời gian upload tăng thêm: P95 ≤ 1 s ở `off` (tệp 50 MiB); ≤ 5 s ở `warn` với DOCX/PDF 10 MiB có chữ | Mục tiêu ban đầu [Cần đo] |
| DUP-NFR-05 | Mỗi request upload/replace tốn ≤ 5 truy vấn DB thêm; quét ≤ 2001 dòng × ≈ 0,6 KB | Giới hạn cứng |
| DUP-NFR-06 | Transaction cuối giữ khoá < 100 ms | Mục tiêu |
| DUP-NFR-07 | Không lưu chữ trích ra; log không chứa tiêu đề hay tên tệp | Giới hạn cứng |
| DUP-NFR-08 | `pdfjs-dist` pin chính xác `6.5.438`, chạy với `isEvalSupported: false` | Giới hạn cứng |

## 12. Tình huống biên và lỗi (bổ sung §4.3, §4.6)

| Tình huống | Hành vi |
|---|---|
| Tệp 0 byte, sai loại | Như hiện tại (400/415), A không chạy |
| DOCX hợp lệ nhưng `document.xml` rỗng | `SKIPPED/INSUFFICIENT_TEXT` |
| PPTX có `slide10.xml` đứng trước `slide2.xml` trong ZIP | Ghép theo 1, 2, …, 10 |
| ZIP bomb trong `document.xml` | Dừng ở 10 MiB đã giải nén → `PARTIAL/PART_LIMIT`; RAM worker bị chặn |
| Hai worker cùng lúc | Không xảy ra (1 job); job thứ 2–4 chờ, job thứ 5 → `BUSY` |
| Instance bị ASG terminate giữa upload | Request lỗi phía client; không có dòng nào; object có thể mồ côi (như hiện tại) |
| `DUPLICATE_MODE` sai giá trị | Process không khởi động (zod), đúng như mọi biến khác |
| Tài liệu trùng là chính nó (replace) | Bị loại bằng `excludeId` |

## 13. Tiêu chí nghiệm thu

Chi tiết test ở [ACCEPTANCE_AND_ROLLOUT §3](ACCEPTANCE_AND_ROLLOUT.md#3-ma-trận-test--feature-a). Tóm tắt: mọi DUP-T đạt; mọi test cũ qua với `warn`; bộ DUP-EVAL có báo cáo precision/recall ở các ngưỡng 0,4…0,9, và ở ngưỡng được chốt **không có cặp "khác nhau" nào bị cảnh báo**; BENCH-A1/A2 có số đo thật.

## 14. Phụ thuộc và rủi ro

- **Phụ thuộc:** Phase 0 đã merge (schema, `text-normalize`, `document.scope`, repository, env, mã lỗi); DR-09 (bộ dữ liệu gắn nhãn). DR-02, DR-05 đã chốt.
- **Rủi ro:** R-01, R-02, R-03, R-04, R-08, R-11 ở [SHARED §13.3](SHARED_CONTRACTS.md#133-rủi-ro).
