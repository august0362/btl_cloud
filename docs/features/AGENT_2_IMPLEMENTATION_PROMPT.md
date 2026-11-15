# AGENT 2 — Implementation Prompt: Feature B (Hybrid Recommendation)

> Nhiệm vụ tự chứa. Chỉ giao khi: owner đã duyệt cuối bộ đặc tả, **Phase 0 đã merge vào `main`** (Gate G0) và owner đã điền `<P0_SHA>` dưới đây.

## 1. Vai trò và mục tiêu

Bạn là **Agent 2**, coding agent cho **Feature B: gợi ý tài liệu kết hợp** trong repo BTL Cloud (Express 5 + Prisma 6 + MySQL 8.4 + React 19/Vite). Làm **đầy đủ, chạy được, có test**, không skeleton, không pseudocode.

- TF-IDF + cosine trên `title`/`description`, chỉ mục trong RAM (≤ 5 000 tài liệu discoverable).
- Ghi tương tác VIEW/DOWNLOAD phía server theo **opt-in**.
- Gợi ý trang chủ (cá nhân hoá, popular, newest/cold start), tài liệu liên quan, autocomplete, xếp hạng tìm kiếm `sort=relevance` (truy vấn thắng sở thích).
- Cài đặt cá nhân hoá, xoá lịch sử, frontend, test, benchmark.

## 2. Repository, nhánh, baseline

- Repo: `https://github.com/august0362/btl_cloud`. Baseline code: `origin/main` @ `2f1ebbd`.
- Phase 0 merge commit: **`<P0_SHA>`** (owner điền). Kiểm `git log` có commit này trước khi làm.
- Tạo nhánh `feature/hybrid-recommendation` từ `<P0_SHA>`. Không push vào `main`, không merge. Mở **một PR** vào `main` để owner review. Feature A merge trước; khi owner yêu cầu, rebase lên `main` mới và chạy lại toàn bộ test.

## 3. Đọc trước khi code (theo thứ tự)

1. `docs/features/SHARED_CONTRACTS.md` — toàn bộ, đặc biệt §5, §6 (gồm §6.2a), §7, §9, §13.
2. `docs/features/HYBRID_RECOMMENDATION_SPEC.md` — **đặc tả chính**, làm đúng từng mục.
3. `docs/features/ACCEPTANCE_AND_ROLLOUT.md` §2, §4, §5.2, §6 (G2), §7.
4. `docs/ARCHITECTURE.md` §A7 (API, envelope), §A12.6 (cache); `README.md` (cách chạy test, quy tắc DB).
5. Code hiện có: `backend/src/modules/documents/*`, `modules/audit/*` (mẫu fire-and-forget), `modules/users/activity-tracker.ts`, `http/middleware/*`, `frontend/src/pages/*`, `frontend/src/api/*`.

## 4. Yêu cầu

**Chức năng:** REC-FR-001…014 (REC §11). Điểm bắt buộc:
- **Opt-in (DR-03):** `personalization_enabled` mặc định `false`. Chưa bật → **không ghi** gì. Ghi bằng **đúng câu upsert** REC §3 (có `WHERE u.personalization_enabled = TRUE`). Tắt → xoá toàn bộ lịch sử trong cùng transaction. Bật → ghi từ lúc đó.
- Không có endpoint ghi tương tác; ghi qua middleware sau loader `view`, không chờ (fire-and-forget).
- Hồ sơ sở thích tính lại mỗi request (REC §3.1), không lưu.
- Chỉ mục: REC §4.3 (dựng lười, làm mới 10 phút, lô 250 + `setImmediate`, một lần dựng/instance, lỗi giữ chỉ mục cũ).
- **Mọi kết quả** qua `findDiscoverableByIds` ngay trước khi trả.
- **Tìm kiếm `sort=relevance`** đúng REC §5.3–5.4: `level` (0–5) so **trước**, sau đó `0.5·pref + 0.25·pop + 0.25·fresh`, rồi `created_at DESC, id DESC`; top-200 xếp trong app, phần sau theo `searchRelevanceOrdered`; lỗi → thứ tự SQL thô; **không bao giờ 5xx** vì ranking.
- Autocomplete REC §5.5 (≥ 2 ký tự, ≤ 8, không cá nhân hoá, rate limit 60/phút/IP, không lưu `q`). Request logger che giá trị `q` mọi đường dẫn.
- Purge tương tác > 90 ngày lúc khởi động và mỗi 24 giờ (REC-FR-012).
- Fallback REC §7; `RECOMMENDATIONS_ENABLED=false` → không ghi, home `NEWEST`, related/suggestions `[]`, relevance theo thứ tự SQL thô.

**Phi chức năng:** REC-NFR-01…07. Không trả số lượt xem/tải. Không đọc `document_fingerprints`, không dùng `audit_events`.

## 5. Hợp đồng

- **DB:** dùng đúng `DocumentInteraction`, `User.personalizationEnabled` của Phase 0. **Không** sửa schema, không tạo migration.
- **Repository:** dùng `findDiscoverableByIds`, `searchRelevanceOrdered`, `search()` có sẵn. Không sửa `document.repository.ts`. Truy vấn tương tác/settings viết trong `modules/recommendations/`.
- **Chuẩn hoá:** `tokenize(…, { minLength: 2 })` cho vector; `foldForMatch` cho `level` và autocomplete. Không tự viết hàm chuẩn hoá khác.
- **API:** REC-API-01…07 (REC §9.1), DTO `RecommendationItemDto`, `SuggestionDto`, `SettingsDto`. API-07 thêm `sort=relevance`, mặc định vẫn `newest`; API-08 từ chối `relevance` (400 `INVALID_ENUM`). Không thêm mã lỗi mới.
- **Contract test:** chỉ **thêm** schema strict cho endpoint B trong `test/helpers/contract.ts`; contract API-07 cũ không đổi.
- **Log:** sự kiện REC §9.3.

## 6. File bạn được sửa

`backend/src/modules/recommendations/**` (mới) · `documents.routes.ts` (middleware tương tác cho `GET /:id`, `/:id/download`; route `/:id/related`) · `documents.schemas.ts` (`relevance` cho API-07) · `documents.controller.ts` (`searchPublic`, tham số `searchRanker` của `createDocumentsController`) · `container.ts` (chỉ khối `// Feature B` và dòng `createDocumentsController`) · `app.ts` (router `/api/recommendations`) · `server.ts` (purge, timer chỉ mục `unref`) · `lib/module-of.ts` · `http/middleware/request-context.ts` (che `q`) · `test/helpers/contract.ts` (chỉ thêm) · `backend/test/fixtures/rec-eval.ts` · test mới `backend/test/**/recommendations-*.test.ts` · `frontend/src/api/recommendations.ts`, `api/types.ts` (`sort` thêm `relevance`), `api/documents.ts` (chỉ **thêm** hàm), `pages/DocumentListPages.tsx`, `pages/DocumentDetailPage.tsx`, `components/SearchBar.tsx`, `hooks/useDocumentFilters.ts` + test frontend tương ứng.

## 7. File không được sửa

Mọi file đóng băng ở SHARED §9: `schema.prisma`, `migrations/**`, `lib/text-normalize.ts`, `document.scope.ts`, `document.repository.ts`, `env.ts`, `errors.ts`, `error-handler.ts`, `database-schema.test.ts`, `test/integration/context.ts`. Mọi file của Agent 1 (`modules/duplicates/**`, `documents.service.ts`, `create`/`replaceFile` trong controller, `UploadPage.tsx`, `EditDocumentPage.tsx`, `api/errors.ts`, `lib/errorMessages.ts`, …). `package.json`/lockfile (B **không thêm dependency**). `docs/**`. File không có trong SHARED §9 → không sửa.

Cần sửa file đóng băng hoặc thấy hợp đồng chung sai/thiếu → **dừng phần đó, báo BLOCKER** (mục 12), không tự thiết kế lại.

## 8. Ràng buộc owner đã chốt

DR-03 opt-in, tắt = xoá lịch sử · DR-04 giữ 90 ngày · DR-12 frontend có `q` thì mặc định `relevance`, API mặc định `newest` · Sửa 2: truy vấn quyết định trước sở thích/phổ biến/độ mới · Collaborative Filtering, embedding, bigram, lưu truy vấn, theo dõi chuột/cuộn: **không làm** · DR-08 (dùng từ khoá của A) **không làm** · trọng số nằm trong một object hằng số ở `ranking.policy.ts`.

## 9. Milestone

| # | Việc | Xong khi |
|---|---|---|
| M1 | TF-IDF, cosine, `level`, ranking policy (hàm thuần) | REC-T-01, 02, 26, 27 |
| M2 | Ghi tương tác opt-in, settings, xoá lịch sử, purge | REC-T-10…14, 28 |
| M3 | Chỉ mục RAM, home, related, popularity, cold start, fallback | REC-T-03…06, 08, 09, 15, 16, 19, 20 |
| M4 | `sort=relevance`, autocomplete, rate limit, che `q` | REC-T-07, 17, 18, 21, 22 |
| M5 | Frontend: home, liên quan, SearchBar combobox, lời mời bật, hộp tuỳ chọn, sắp xếp mặc định | REC-T-24 |
| M6 | Hồi quy + BENCH-B1/B2 local | REC-T-23, 25; số đo ghi trong PR |

## 10. Nghiệm thu và lệnh chạy

Đạt toàn bộ REC-T-01…28 (ACCEPTANCE §4) và Gate G2. Chạy và dán kết quả thật:

```bash
npm ci
npm --prefix backend run lint && npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run test:integration     # cần MySQL + SeaweedFS local; chỉ dùng DB btl_cloud_test
npm --prefix backend run build
npm --prefix frontend run lint && npm --prefix frontend run typecheck
npm --prefix frontend test && npm --prefix frontend run build
```

Không có MySQL/SeaweedFS → ghi rõ "integration CHƯA CHẠY", không tuyên bố PASS.

## 11. Lỗi và tình huống biên

Theo REC §7 và §13. Nhắc lại các điểm dễ sai: tài liệu vừa chuyển Private khi chỉ mục chưa làm mới phải biến mất ở home/related/suggestions (kiểm lại bằng SQL); không ghi khi tải bị ngắt giữa chừng; chủ xem tài liệu của mình không ghi; phân trang `relevance` không trùng, không thiếu qua ranh giới 200; `q` toàn ký tự đặc biệt → `level` 0; corpus rỗng → `NEWEST` với `items: []`; frontend luôn ẩn mục gợi ý khi lỗi, không chặn trang chính.

## 12. Báo cáo hoàn thành (trong mô tả PR)

1. Tóm tắt thay đổi theo milestone; danh sách file đã sửa (đối chiếu mục 6).
2. Lệnh đã chạy + kết quả (số test pass/fail/skip). Ghi rõ cái nào chưa chạy và lý do.
3. BENCH-B1/B2 (máy, Node, số đo).
4. Sai lệch so với spec (nếu có) và lý do; giới hạn và rủi ro còn lại (gồm R-12: opt-in làm dữ liệu ít).
5. **BLOCKER** (nếu có): file/hợp đồng nào, vấn đề gì, đề xuất, phần nào đã dừng.
6. Nội dung cần integrator cập nhật vào `docs/`.

## 13. Điều kiện dừng và điều cấm

**Dừng và báo** khi: Phase 0 chưa có trên `main`; cần sửa file đóng băng hoặc file của Agent 1; spec mâu thuẫn hoặc thiếu; cần dependency mới; test cũ vỡ mà không sửa được trong phạm vi file của bạn.

**Tuyệt đối không:** merge hoặc push vào `main`; sửa schema/migration/hợp đồng chung; chạy `prisma migrate reset`/`migrate dev`/`db push` trên DB khác `*_test`; reset hay xoá dữ liệu `btl_cloud`, `btl_cloud_load`; chạm AWS; đọc hay in secret; ghi tương tác khi user chưa bật; lưu hoặc log giá trị truy vấn; trả số liệu popularity; đọc `document_fingerprints`; sửa code của Agent 1; tuyên bố PASS khi chưa chạy.
