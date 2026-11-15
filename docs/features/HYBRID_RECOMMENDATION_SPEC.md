# HYBRID_RECOMMENDATION_SPEC — Feature B: Gợi ý tài liệu kết hợp

> **Trạng thái: ĐÃ DUYỆT CÓ ĐIỀU KIỆN (16/11/2026), chờ duyệt cuối. Chưa triển khai.** Người làm: **Implementation Agent 2** (sau Phase 0).
> Phải đọc trước: [SHARED_CONTRACTS](SHARED_CONTRACTS.md). Test và rollout ở [ACCEPTANCE_AND_ROLLOUT](ACCEPTANCE_AND_ROLLOUT.md).
> Ký hiệu [Đã kiểm] / [Đo local] / [Giả định] / [Cần đo] như SHARED_CONTRACTS.

## 1. Mục tiêu và phạm vi

Gợi ý tài liệu **gọn nhẹ, giải thích được, giữ riêng tư**, kết hợp năm tín hiệu: nội dung (TF-IDF + cosine trên tiêu đề và mô tả), lịch sử tương tác của người dùng, độ phổ biến, độ mới, và truy vấn đang tìm.

| Trải nghiệm | Endpoint |
|---|---|
| Gợi ý trên trang chủ | REC-API-01 |
| Tài liệu liên quan ở trang chi tiết | REC-API-02 |
| Gợi ý khi gõ tìm kiếm (autocomplete) | REC-API-03 |
| Xếp hạng kết quả theo ngữ cảnh | REC-API-04 (mở rộng API-07) |
| Người dùng mới hoặc Guest | Cold start trong REC-API-01 |
| Tắt cá nhân hoá, xoá lịch sử | REC-API-05…07 |

**Ngoài phạm vi:** Collaborative Filtering, matrix factorization, mô hình học sâu, embedding, yêu thích (favorite), theo dõi chuột/cuộn/phím, ghi log truy vấn thô, dùng nội dung trích từ tệp (xem [SHARED §7](SHARED_CONTRACTS.md#7-hợp-đồng-tích-hợp-a--b)).

## 2. Dữ liệu sẵn có (B1) [Đã kiểm]

| Tín hiệu | Có sẵn? | Dùng thế nào |
|---|---|---|
| `title` (≤ 200), `description` (≤ 2000, **có thể null**) | Có, `documents` | Vector TF-IDF; khớp truy vấn |
| `file_type` | Có | Chỉ dùng lọc theo `fileType` như hiện tại; không đưa vào điểm |
| `created_at` | Có | Độ mới |
| `visibility`, chủ DELETING | Có | Điều kiện bắt buộc qua `discoverableSql()` |
| Lượt xem chi tiết | **Không**. Audit cố ý không ghi | Bảng mới `document_interactions` (VIEW) |
| Lượt tải | Audit có `DOCUMENT_DOWNLOAD`, nhưng không dùng: audit phục vụ trách nhiệm giải trình, giữ 90 ngày theo env, không có opt-out, và bị xoá theo actor khi xoá tài khoản | `document_interactions` (DOWNLOAD) |
| Yêu thích | **Không có tính năng** | Không làm |
| Độ phổ biến | Không có | Tính từ `document_interactions` |
| Truy vấn hiện tại | Chỉ có trong request | Dùng trực tiếp, **không lưu** |

## 3. Sự kiện tương tác (B2)

| | `VIEW` | `DOWNLOAD` |
|---|---|---|
| Ý nghĩa | Người dùng mở trang chi tiết tài liệu của **người khác** | Tải thành công tài liệu của **người khác** |
| Điểm ghi | Middleware `trackInteraction('VIEW')` sau loader `view` ở `GET /api/documents/:id`; ghi khi response 2xx đã gửi xong (`finish`) | `trackInteraction('DOWNLOAD')` ở `GET /:id/download`; ghi khi `res.writableFinished` và status 200 (bị ngắt giữa chừng thì không ghi) |
| Danh tính | `req.auth.userId` (cookie phiên). Guest: **không ghi** | Luôn có (API-13 bắt buộc đăng nhập) |
| Tài liệu | `res.locals.document` (đã qua `canView`) | Như VIEW |
| Bỏ qua khi | Không đăng nhập; viewer là chủ; tài liệu không PUBLIC; user **chưa bật** cá nhân hoá (mặc định, DR-03) hoặc đang DELETING; `RECOMMENDATIONS_ENABLED=false` | Như VIEW |
| Chống trùng | Khoá chính `(user_id, document_id, kind)`. Lặp lại chỉ cập nhật `last_at`, nên 1 user = tối đa 1 lượt/loại/tài liệu | Như VIEW |
| Rate limit | Không cần: ghi phía server, không có endpoint ghi; mỗi lần ghi là 1 upsert | Như VIEW |
| Giữ | 90 ngày theo `last_at` (DR-04) | Như VIEW |
| Xoá | CASCADE khi xoá tài liệu hoặc user; REC-API-07 (xoá lịch sử); tắt cá nhân hoá | Như VIEW |

**Câu ghi duy nhất** (không đọc thêm, không race):

```sql
INSERT INTO document_interactions (user_id, document_id, kind, first_at, last_at)
SELECT u.id, :documentId, :kind, :now, :now
FROM users u
WHERE u.id = :userId AND u.personalization_enabled = TRUE AND u.deletion_started_at IS NULL
ON DUPLICATE KEY UPDATE document_interactions.last_at = GREATEST(document_interactions.last_at, :now);
```

- Không chờ ghi (fire-and-forget như `AuditRecorder`). Lỗi → log WARN `interactions.write_failed` (không có `documentId` hay tiêu đề), response không đổi.
- **Không phải sự kiện:** gọi autocomplete, tìm kiếm, mở trang chủ, xem danh sách, sửa tài liệu của mình.
- **Không** có endpoint `POST /interactions`: client không thể giả mạo hay thổi số lượt.

### 3.1 Cập nhật sở thích

Không lưu hồ sơ sở thích. Hồ sơ được **tính lại mỗi request** từ tối đa 50 tương tác gần nhất trong 90 ngày, nên mọi thay đổi (xem mới, xoá lịch sử, tài liệu bị xoá hoặc chuyển Private) có hiệu lực ngay.

```text
history = SELECT document_id, kind, last_at FROM document_interactions
          WHERE user_id = :u AND last_at >= now − 90d ORDER BY last_at DESC LIMIT 50
w(row)  = (kind = DOWNLOAD ? 2 : 1) × 0.5^(tuổi(last_at) theo ngày / 30)
profile = Σ w(row) · vec(document_id)      // chỉ tài liệu có trong chỉ mục (tức discoverable)
          → giữ 100 term có trọng số lớn nhất → chuẩn hoá L2
hasProfile = profile khác vector 0
```

## 4. Lọc theo nội dung (B3)

### 4.1 Đầu vào và tách từ

- **Văn bản của một tài liệu:** `title` lặp 2 lần (tăng trọng số tiêu đề) + `description` (bỏ qua nếu null).
- **Tách từ:** `tokenize(text, { minLength: 2 })` của [SHARED §6.1](SHARED_CONTRACTS.md#61-backendsrclibtext-normalizets-hàm-thuần-không-io), gồm NFKC, chữ thường, **giữ dấu**, tách theo ký tự không phải chữ/số. Tiếng Việt tách theo **âm tiết** ("điện", "toán"), tiếng Anh theo từ.
- **Chỉ dùng unigram.** Bigram ghép được từ tiếng Việt ("điện toán") nhưng [Đo local] làm số term tăng từ ≈ 8 000 lên ≈ 714 000 và thời gian dựng tăng ≈ 4,5 lần, nên bị loại cho MVP (R-10).
- Không dùng danh sách stopword. IDF tự hạ trọng số các từ phổ biến như "và", "của", "the".

### 4.2 Vector và IDF

```text
N      = số tài liệu trong chỉ mục
df(t)  = số tài liệu chứa term t
idf(t) = ln((1 + N) / (1 + df(t))) + 1                 // smooth IDF, luôn > 0
tf(t,d)= số lần xuất hiện (tính cả tiêu đề lặp)
w(t,d) = (1 + ln tf(t,d)) · idf(t)                    // sublinear tf
vec(d) = w(·,d) chuẩn hoá L2, lưu dạng thưa: Int32Array termIds (tăng dần) + Float32Array weights
cos(u,v) = Σ u_t · v_t                                // ∈ [0,1] vì trọng số không âm
```

Vector cho văn bản không có trong chỉ mục (tài liệu Private của chính người xem, tài liệu mới) được tính tại chỗ bằng `idf` của chỉ mục. Term không có trong từ vựng thì bị bỏ.

### 4.3 Chỉ mục trong RAM (dữ liệu suy ra)

| Mục | Quy định |
|---|---|
| Nội dung | Tối đa **5 000** tài liệu discoverable mới nhất: `id`, `ownerId`, `title`, `foldForMatch(title)`, `createdAt`, `vec`, `pop` + từ vựng và `idf` |
| Nguồn | 1 truy vấn `documents` (`WHERE discoverableSql() ORDER BY created_at DESC, id DESC LIMIT 5000`) + 1 truy vấn popularity (§5.1) |
| Dựng khi | Request đầu tiên cần đến; sau đó làm mới **mỗi 10 phút** (timer `unref`) và lười khi chỉ mục cũ hơn 10 phút |
| Đồng thời | Chỉ một lần dựng đang chạy / instance (dùng chung một promise); request đến trong lúc dựng thì dùng chỉ mục cũ, hoặc fallback nếu chưa từng có |
| Không chặn event loop | Dựng theo lô 250 tài liệu, `await setImmediate()` giữa các lô |
| Lỗi khi dựng | Giữ chỉ mục cũ; log WARN `recommendations.index_failed`; chưa từng có thì dùng fallback (§7) |
| Không phải nguồn sự thật | Mất khi khởi động lại; **mọi kết quả được kiểm lại quyền** bằng `findDiscoverableByIds` trước khi trả |
| Không chứa | Tài liệu Private, tài liệu của chủ DELETING, mô tả gốc (chỉ giữ vector) |

Chỉ mục được phép là cache vì: chỉ chứa dữ liệu **công khai**, dựng lại được từ RDS, và không bao giờ được dùng để quyết định quyền ([§A12.6](../ARCHITECTURE.md#a126-giám-sát-hiệu-năng-thử-tải-cache): "không cache dữ liệu phụ thuộc quyền").

### 4.4 Chi phí [Đo local, dữ liệu tổng hợp]

Dữ liệu giả lập: mỗi tài liệu có tiêu đề 12 âm tiết, mô tả 300 âm tiết (≈ 2 000 ký tự, tức trường hợp xấu nhất), từ vựng phân phối lệch.

| N | Dựng (unigram) | Dựng (uni + bigram) | Quét cosine toàn bộ |
|---|---|---|---|
| 1 000 | 179 ms | 593 ms | 2,0 ms |
| 5 000 | 799 ms | 3 654 ms | 6,5 ms |

- Trung bình ≈ 203 term khác 0 mỗi tài liệu. Ước tính RAM của vector: 5 000 × 203 × 8 byte ≈ 8 MB, cộng từ vựng và tiêu đề. **Ngân sách ≤ 64 MB** [Cần đo, BENCH-B1].
- Quét toàn bộ 5 000 vector mất vài ms, nên **không cần** inverted index hay ANN. Số ứng viên luôn ≤ 5 000.

## 5. Xếp hạng kết hợp (B4)

### 5.1 Tín hiệu đã chuẩn hoá về [0, 1]

| Tín hiệu | Định nghĩa |
|---|---|
| `content` | `cos(vec(query hoặc doc nguồn), vec(d))` |
| `pref` | `cos(profile, vec(d))`; 0 khi không có hồ sơ |
| `pop` | `raw(d)` = Σ trên các dòng có `last_at ≥ now − 30d` và user chưa DELETING: VIEW = 1, DOWNLOAD = 2 (mỗi user tối đa 3). `pop = ln(1 + raw) / ln(1 + max raw)` trên chỉ mục; `max raw = 0` → `pop = 0` |
| `fresh` | `0.5^(tuổi(created_at) theo ngày / 30)` |
| `level` (tìm kiếm, số nguyên 0–5) | Xem §5.3. Không chuẩn hoá, không trộn với tín hiệu khác |

Truy vấn popularity (khi dựng chỉ mục):

```sql
SELECT i.document_id, SUM(CASE i.kind WHEN 'DOWNLOAD' THEN 2 ELSE 1 END) AS raw
FROM document_interactions i JOIN users u ON u.id = i.user_id AND u.deletion_started_at IS NULL
WHERE i.last_at >= :since30d
GROUP BY i.document_id;
```

### 5.2 Chính sách theo bề mặt (`ranking.policy.ts`)

Trọng số dưới đây được **chọn tay để dễ giải thích**, không phải tối ưu khoa học. Tất cả nằm trong một object hằng số duy nhất.

| Bề mặt | Ứng viên | Điểm / thứ tự | Loại trừ |
|---|---|---|---|
| **Trang chủ, có hồ sơ** | Toàn bộ chỉ mục | `0.5·pref + 0.3·pop + 0.2·fresh` | Tài liệu của chính mình; tài liệu đã tương tác trong 90 ngày |
| **Trang chủ, cold start** (Guest, chưa có lịch sử, đã tắt cá nhân hoá) | Toàn bộ chỉ mục | `0.6·pop + 0.4·fresh` (chưa ai tương tác → tương đương "mới nhất") | Tài liệu của chính mình (nếu đã đăng nhập) |
| **Liên quan** (REC-API-02) | Toàn bộ chỉ mục | `0.8·content + 0.1·pop + 0.1·fresh`, **chỉ** lấy `content ≥ 0.10` | Chính tài liệu nguồn |
| **Kết quả tìm kiếm** `sort=relevance` | Tập khớp SQL hiện tại (không đổi điều kiện lọc) | `level DESC`, rồi `0.5·pref + 0.25·pop + 0.25·fresh DESC`, rồi `created_at DESC, id DESC` (§5.4) | Như API-07 |
| **Autocomplete** | Tiêu đề trong chỉ mục | `match DESC` (3 = tiêu đề bắt đầu bằng q; 2 = một từ bắt đầu bằng q; 1 = chứa q), rồi `pop DESC`, `created_at DESC`, `id`. **Không cá nhân hoá** | Tiêu đề trùng nhau sau khi fold (giữ cái xếp cao hơn) |

Mọi danh sách đều có tie-break cuối cùng là `created_at DESC, id DESC`, nên thứ tự **xác định** khi dữ liệu không đổi. Mỗi `documentId` chỉ xuất hiện một lần.

### 5.3 Truy vấn luôn thắng cá nhân hoá

`level` đo **mức khớp truy vấn**, tính trên chuỗi đã `foldForMatch` (`t` = tiêu đề, `s` = mô tả hoặc `""`, `k` = q). "Khớp nguyên từ" nghĩa là `" " + x + " "` chứa `" " + k + " "`; "đầu từ" nghĩa là `x` bắt đầu bằng `k` hoặc chứa `" " + k`.

| `level` | Điều kiện (lấy mức cao nhất đúng) |
|---|---|
| 5 | `t = k` |
| 4 | `t` khớp nguyên từ `k` |
| 3 | `t` có `k` ở đầu từ |
| 2 | `t` chứa `k` |
| 1 | `s` chứa `k` |
| 0 | Còn lại (SQL khớp theo collation nhưng fold không thấy), hoặc `k` rỗng |

**Quy tắc:** sắp theo `level` **trước**; `pref`, `pop`, `fresh` chỉ phân định thứ tự **trong cùng `level`**. Hệ quả kiểm được: (1) tài liệu có `level` cao hơn **không bao giờ** đứng sau tài liệu `level` thấp hơn trong top-200; (2) Guest và user có hồ sơ chỉ khác nhau **bên trong** một `level`. Ví dụ: user thích AI tìm "AWS" → mọi tài liệu có "AWS" trong tiêu đề đứng trên tài liệu AI chỉ nhắc "AWS" trong mô tả, dù `pref` = 1.

### 5.4 Tìm kiếm `sort=relevance` (REC-API-04)

1. Validate như API-07 (thêm giá trị `relevance`). Không có `q` → xử lý như `newest`.
2. Gọi `searchRelevanceOrdered({ q, fileType, offset: 0, limit: 200 })` ([SHARED §6.2a](SHARED_CONTRACTS.md#62a-documentrepositoryts--phần-phase-0-thêm-đóng-băng-sau-g0)): cùng WHERE với `search()`, thứ tự SQL "liên quan thô" = khớp tiêu đề trước, rồi mới nhất. Nhận `total` và tối đa 200 dòng đầu.
3. Xếp hạng 200 dòng này trong app theo §5.2 (`level`, rồi điểm phụ, rồi `created_at DESC, id DESC`).
4. Trang `[offset, offset + pageSize)`: vị trí < 200 lấy từ danh sách đã xếp; vị trí ≥ 200 lấy bằng `searchRelevanceOrdered({ offset: max(offset, 200), … })` (giữ thứ tự SQL). Vì thứ tự SQL xác định (có `id`), hai phần **không trùng, không thiếu**. `totalItems` = `total`, bằng tổng của `newest`. Lấy DTO bằng `findDiscoverableByIds(pageIds)`.
5. **Ngoài top-200** chỉ giữ thứ tự thô (tiêu đề trước mô tả). Mọi tài liệu khớp tiêu đề vẫn đứng trước mọi tài liệu chỉ khớp mô tả trên **toàn bộ** kết quả, trừ ngoại lệ `level` 0. Đây là giới hạn đã chấp nhận.
6. Chưa có chỉ mục: vẫn tính `level` (dữ liệu lấy từ SQL), bỏ `pref`/`pop`. Lỗi bất kỳ ở bước 3–4 → log WARN `recommendations.fallback` (`surface: "search"`), trả **thứ tự SQL thô** (gọi lại `searchRelevanceOrdered` với `offset` của trang). **Không bao giờ 5xx** vì ranking.
7. **Phân trang:** thứ tự ổn định khi dữ liệu không đổi; có thể dịch khi có tài liệu hay tương tác mới giữa hai lần gọi, giống `newest` hiện tại.

### 5.5 Autocomplete (REC-API-03)

- `q` được trim. Dưới 2 code point → `items: []` (không gọi DB). Trên 100 → 400 `TOO_LONG`.
- Khớp trên `foldForMatch(title)` trong chỉ mục (≤ 5 000 chuỗi, quét tuyến tính). Lấy tối đa 16, kiểm lại bằng `findDiscoverableByIds` (1 truy vấn PK), trả tối đa **8**.
- Frontend: debounce **250 ms**, huỷ request trước bằng `AbortController`, ẩn danh sách khi lỗi hoặc 429.
- Không ghi DB, **không lưu `q`**. Request logger che giá trị `q` (§9.3).

### 5.6 Trang chủ và Liên quan

- Trang chủ: tính điểm cho mọi ứng viên, lấy `2 × limit`, `findDiscoverableByIds`, cắt `limit`. Trang chủ **không phân trang** (danh sách top-N cố định). Nếu kiểm quyền làm rơi bớt kết quả thì trả ít hơn `limit`, không lấp thêm.
- Liên quan: vector nguồn = `vec(doc)` nếu doc nằm trong chỉ mục, nếu không thì tính tại chỗ từ tiêu đề và mô tả (ví dụ tài liệu Private của chính người xem). Kết quả chỉ gồm tài liệu discoverable, nên **không lộ** tài liệu Private khác. Không có tài liệu nào đạt `content ≥ 0.10` → `items: []`.

## 6. Collaborative Filtering (B5): không làm trong MVP

- **Dữ liệu thưa:** quy mô lớp học có vài chục tới vài trăm user, mỗi người vài tương tác. Ma trận user × tài liệu gần như rỗng, nên độ tương đồng giữa user rất nhiễu.
- **Cold start:** tài liệu mới không có tương tác nên không bao giờ được CF gợi ý. Đây lại là trường hợp phổ biến nhất ở một kho tài liệu mới.
- **Riêng tư:** CF cho phép suy ra "người giống bạn đã xem gì", khó giải thích với người dùng.
- **Mở rộng sau (cần CR):** khi một tài liệu có ≥ 20 user tương tác, thêm tín hiệu "người tải X cũng tải Y" (đồng xuất hiện item-item), tính lúc dựng chỉ mục. Không dùng matrix factorization.

## 7. Fallback và cô lập lỗi

| Tình huống | REC-API-01 | REC-API-02 | REC-API-03 | REC-API-04 |
|---|---|---|---|---|
| `RECOMMENDATIONS_ENABLED=false` | `NEWEST` (truy vấn `search()` cũ) | `items: []` | `items: []` | Thứ tự SQL thô (§5.4 bước 6); không ghi tương tác |
| Chưa có chỉ mục hoặc dựng lỗi | `NEWEST` | `items: []` | `items: []` | `level` + `created_at` (không `pref`/`pop`) |
| Lỗi đọc lịch sử | Cold start | Không ảnh hưởng | Không ảnh hưởng | Bỏ `pref` |
| RDS lỗi | Lỗi chuẩn 500/503; FE ẩn mục | FE ẩn mục | FE ẩn danh sách | Lỗi như API-07 hiện tại |

Frontend **luôn** ẩn mục gợi ý khi lỗi. Lỗi gợi ý không bao giờ chặn trang chủ, chi tiết hay tìm kiếm.

## 8. Riêng tư và quyền kiểm soát (B6)

- **Mặc định: TẮT (opt-in, DR-03).** Cột `personalization_enabled` mặc định `false` cho cả user cũ và user mới. Chưa bật thì **không ghi** bất kỳ tương tác nào; trang chủ dùng cold start (Popular/Newest).
- **Lời mời bật** (chỉ user đã đăng nhập và đang tắt): một dòng dưới mục gợi ý trang chủ: "Bật gợi ý cá nhân hoá để nhận tài liệu hợp với bạn. [Bật]". Không bật popup tự động, không làm phiền Guest.
- **Thông báo khi bật** (trong hộp tuỳ chọn, trước nút xác nhận): "Khi bật, hệ thống lưu tài liệu bạn xem và tải trong 90 ngày để gợi ý, và dùng ẩn danh để xếp hạng tài liệu phổ biến. Tắt bất cứ lúc nào, lịch sử sẽ bị xoá." Khi đang bật, dưới "Gợi ý cho bạn" có link [Tuỳ chọn gợi ý] (công tắc + nút "Xoá lịch sử").
- **Bật** (REC-API-06 `true`): ghi từ lúc đó, không ghi bù quá khứ. **Tắt** (`false`): ngừng ghi, xoá toàn bộ lịch sử trong cùng transaction, chuyển sang cold start.
- **Phổ biến** chỉ đến từ tương tác của user đã bật (người tắt đã bị xoá dòng), nên thường yếu (R-12).
- **Xoá lịch sử** (REC-API-07): xoá mọi dòng của user. Popularity thay đổi ở lần dựng chỉ mục kế tiếp (≤ 10 phút).
- **Xoá tài khoản:** CASCADE (không sửa mã admin). **Giữ:** 90 ngày.
- **Không lưu truy vấn.** Lịch sử chỉ gồm `(user, tài liệu, loại, thời điểm đầu, thời điểm cuối)`, không có IP, user-agent hay thời lượng.
- **Kiểm lại quyền lúc trả kết quả** bằng `findDiscoverableByIds` ở mọi endpoint. Danh sách gợi ý **không bao giờ** là cơ chế phân quyền: mở hay tải tài liệu vẫn đi qua loader và `canView` như cũ.
- Popularity chỉ hiện ra dưới dạng thứ tự, không bao giờ trả về số lượt xem/tải của từng tài liệu.

## 9. Hợp đồng API

Quy ước chung theo [§A7.1–A7.3](../ARCHITECTURE.md#a71-quy-ước-chung): envelope `{ data }`, `camelCase`, GET không cần CSRF, PUT/DELETE cần `X-CSRF-Protection: 1`.

### 9.1 Endpoint

| ID | Method · Path | Quyền | Query/Body | 200 `data` | Lỗi |
|---|---|---|---|---|---|
| REC-API-01 | `GET /api/recommendations/home` | Công khai, cookie tuỳ chọn | `limit` 1–20, mặc định 8 | `{ strategy, items: RecommendationItemDto[] }` | 400 |
| REC-API-02 | `GET /api/documents/{id}/related` | Loader `view` (như API-09) | `limit` 1–12, mặc định 6 | `{ items: DocumentDto[] }` | 404, 400 |
| REC-API-03 | `GET /api/recommendations/suggestions` | Công khai | `q` (trim, 0–100) | `{ items: SuggestionDto[] }` (≤ 8) | 400 `TOO_LONG`, 429 |
| REC-API-04 | `GET /api/documents` (API-07) | Như cũ | `sort` thêm `relevance` | `Page<DocumentDto>` không đổi | 400 |
| REC-API-05 | `GET /api/recommendations/settings` | User | — | `SettingsDto` | 401 |
| REC-API-06 | `PUT /api/recommendations/settings` | User + CSRF | `{ "personalizationEnabled": boolean }` (strict) | `SettingsDto` | 400, 401 |
| REC-API-07 | `DELETE /api/recommendations/history` | User + CSRF | — | 204 | 401 |

```ts
type Strategy = 'PERSONALIZED' | 'POPULAR' | 'NEWEST';
interface RecommendationItemDto {
  document: DocumentDto;                                  // đúng §A7.4, luôn PUBLIC
  reason: 'SIMILAR_TO_HISTORY' | 'POPULAR' | 'NEW';       // tín hiệu đóng góp lớn nhất
}
interface SuggestionDto { documentId: string; title: string }   // chỉ tài liệu discoverable
interface SettingsDto { personalizationEnabled: boolean; historyItems: number }
```

- `strategy`: `PERSONALIZED` khi có hồ sơ; `POPULAR` khi cold start và có ít nhất 1 tài liệu với `pop > 0`; `NEWEST` khi còn lại hoặc khi fallback.
- `reason`: lấy theo thành phần lớn nhất trong điểm của item (`pref` → `SIMILAR_TO_HISTORY`, `pop` → `POPULAR`, `fresh` → `NEW`). Ở `NEWEST` luôn là `NEW`.
- **Thứ tự route:** `/api/documents/:id/related` đăng ký cùng chỗ với các route `/:id`. `/api/recommendations` là router mới trong `app.ts`.
- **Tương thích ngược:** không đổi trường nào cũ. API-08 (`/mine`) **không** nhận `relevance` (400 `INVALID_ENUM`).

### 9.2 Rate limit

REC-API-03: 60 request/phút/IP, mỗi instance (`express-rate-limit`, cùng cách xử lý 429 + `Retry-After` như `authRateLimit`). Các endpoint khác không thêm giới hạn (chi phí thấp, chỉ đọc).

### 9.3 Log và chẩn đoán

- `request-context.ts`: serializer `req.url` thay giá trị `q` bằng `[redacted]` cho **mọi** đường dẫn (áp dụng cho cả API-07). Đây là thay đổi chỉ làm tăng riêng tư.
- `lib/module-of.ts`: `/api/recommendations` → `recommendations`.
- Sự kiện: `recommendations.index_built` (info: `documents`, `terms`, `durationMs`), `recommendations.index_failed` (warn), `recommendations.fallback` (warn: `surface`, `reason`), `interactions.write_failed` (warn), `interactions.purged` (info: `deleted`).

## 10. Frontend (Agent 2)

- `api/recommendations.ts`: `home(limit)`, `related(id, limit)`, `suggestions(q, signal)`, `getSettings()`, `putSettings()`, `deleteHistory()`.
- **HomePage** (khi không có `q` và `page = 1`): mục "Gợi ý cho bạn" (`PERSONALIZED`) hoặc "Tài liệu nổi bật" (`POPULAR`/`NEWEST`), tối đa 8 thẻ. User đăng nhập đang tắt: dòng lời mời §8; đang bật: link [Tuỳ chọn gợi ý]. Mục bị ẩn khi lỗi hoặc rỗng (lời mời vẫn hiện nếu lấy được settings).
- **DocumentDetailPage:** mục "Tài liệu liên quan" (tối đa 6), ẩn khi rỗng hoặc lỗi.
- **SearchBar:** combobox theo ARIA (`role="combobox"`, `aria-expanded`, `aria-activedescendant`), phím ↑/↓/Enter/Esc. Chọn gợi ý → `/documents/:id`. Enter khi chưa chọn gợi ý → tìm kiếm như cũ.
- **Sắp xếp:** trang Public thêm lựa chọn "Liên quan nhất". Khi có `q` mà người dùng chưa chọn cách sắp → mặc định `relevance` (DR-12). Trang "Tài liệu của tôi" giữ nguyên.

## 11. Yêu cầu chức năng

| ID | Yêu cầu |
|---|---|
| REC-FR-001 | Ghi VIEW/DOWNLOAD đúng §3; chỉ server ghi; idempotent |
| REC-FR-002 | Không ghi cho Guest, chủ tài liệu, user **chưa bật** cá nhân hoá (mặc định) hoặc DELETING, tài liệu không PUBLIC, hay khi `RECOMMENDATIONS_ENABLED=false` |
| REC-FR-003 | Hồ sơ sở thích tính theo §3.1, không lưu |
| REC-FR-004 | Chỉ mục TF-IDF theo §4; chỉ chứa tài liệu discoverable; làm mới ≤ 10 phút |
| REC-FR-005 | Điểm và thứ tự theo §5.2; trọng số ở một file policy |
| REC-FR-006 | Tìm kiếm: `level` luôn quyết định trước (§5.3); top-200 xếp trong app, phần sau theo thứ tự SQL thô; lỗi → thứ tự SQL thô (§5.4) |
| REC-FR-007 | Autocomplete §5.5: ≥ 2 ký tự, ≤ 8 kết quả, không cá nhân hoá, không lưu `q` |
| REC-FR-008 | Liên quan §5.6: loại tài liệu nguồn; `content ≥ 0.10` |
| REC-FR-009 | Mọi kết quả qua `findDiscoverableByIds` ngay trước khi trả |
| REC-FR-010 | Cold start §5.2 cho Guest, user chưa bật hoặc chưa có lịch sử |
| REC-FR-011 | Opt-in, bật/tắt, xoá lịch sử, lời mời và thông báo theo §8 |
| REC-FR-012 | Xoá tương tác có `last_at` cũ hơn 90 ngày lúc khởi động và mỗi 24 giờ (`DELETE … LIMIT 10000` lặp tới hết; lỗi chỉ WARN). Chạy trùng trên nhiều instance vẫn an toàn |
| REC-FR-013 | Fallback §7; lỗi gợi ý không bao giờ làm hỏng trang khác |
| REC-FR-014 | API §9; frontend §10 |

## 12. Yêu cầu phi chức năng

| ID | Yêu cầu | Loại |
|---|---|---|
| REC-NFR-01 | Chỉ mục ≤ 5 000 tài liệu; ≤ 64 MB heap | Giới hạn cứng (số tài liệu); [Cần đo] (RAM) |
| REC-NFR-02 | Dựng chỉ mục 5 000 tài liệu ≤ 2 s; mỗi lô chặn event loop ≤ 50 ms | Mục tiêu; [Đo local] 0,8 s; [Cần đo] trên t3.micro |
| REC-NFR-03 | P95 phía server khi chỉ mục đã sẵn, 10 request đồng thời: home ≤ 300 ms, related ≤ 200 ms, suggestions ≤ 100 ms; `relevance` chậm hơn `newest` ≤ 100 ms | Mục tiêu ban đầu [Cần đo] |
| REC-NFR-04 | Số truy vấn DB mỗi request (không tính truy vấn phiên sẵn có): home ≤ 3, related ≤ 2, suggestions ≤ 1, relevance ≤ 6 (COUNT + 200 dòng, phần đuôi COUNT + dòng khi trang vượt 200, lịch sử, `findDiscoverableByIds`); fallback cộng thêm tối đa 2 | Giới hạn cứng |
| REC-NFR-05 | Không có tính toán nặng trong luồng upload; không quét toàn kho theo request ngoài quét RAM ≤ 5 000 vector | Giới hạn cứng |
| REC-NFR-06 | Ghi tương tác không thêm độ trễ cho API-09/13 (không chờ) | Giới hạn cứng |
| REC-NFR-07 | Mọi kết quả kiểm lại quyền; không trả số liệu popularity | Giới hạn cứng |

## 13. Tình huống biên

| Tình huống | Hành vi |
|---|---|
| Tài liệu vừa chuyển Private, chỉ mục chưa làm mới | Bị `findDiscoverableByIds` loại ngay |
| Tài liệu vừa bị xoá | Bị loại khi kiểm lại; tương tác bị CASCADE |
| Tài liệu mới (< 10 phút) | Chưa có trong gợi ý/autocomplete; vẫn tìm thấy bằng API-07 |
| Hai instance có chỉ mục lệch nhau | Kết quả có thể khác nhau tối đa 10 phút; chấp nhận (R-09) |
| User xem 100 lần một tài liệu | 1 dòng; `raw` của tài liệu tăng tối đa 1 (VIEW) |
| Mô tả null | Chỉ dùng tiêu đề |
| `q` toàn ký tự đặc biệt (`%_!`) | SQL escape như cũ; `foldForMatch(q)` rỗng → mọi kết quả ở `level` 0, sắp theo điểm phụ |
| Corpus rỗng | Home `NEWEST` với `items: []`; related/suggestions `[]` |
| User tự xem tài liệu Private của mình | Không ghi tương tác; REC-API-02 vẫn chạy (chỉ trả tài liệu Public) |

## 14. Tiêu chí nghiệm thu

Chi tiết ở [ACCEPTANCE_AND_ROLLOUT §4](ACCEPTANCE_AND_ROLLOUT.md#4-ma-trận-test--feature-b). Tóm tắt: mọi REC-T đạt trên corpus gắn nhãn REC-EVAL; mọi test cũ qua; BENCH-B1/B2 có số đo thật.

## 15. Phụ thuộc và rủi ro

- **Phụ thuộc:** Phase 0 đã merge (schema, `text-normalize`, `document.scope`, `findDiscoverableByIds`, `searchRelevanceOrdered`, env). DR-01/03/04/12 đã chốt. **Không** phụ thuộc Feature A.
- **Rủi ro:** R-05, R-06, R-07, R-09, R-10, R-12 ở [SHARED §13.3](SHARED_CONTRACTS.md#133-rủi-ro).
