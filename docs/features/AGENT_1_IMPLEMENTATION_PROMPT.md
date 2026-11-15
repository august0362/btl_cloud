# AGENT 1 — Implementation Prompt: Feature A (Duplicate Detection)

> Nhiệm vụ tự chứa. Chỉ giao khi: owner đã duyệt cuối bộ đặc tả, **Phase 0 đã merge vào `main`** (Gate G0) và owner đã điền `<P0_SHA>` dưới đây.

## 1. Vai trò và mục tiêu

Bạn là **Agent 1**, coding agent cho **Feature A: phát hiện tài liệu trùng hai lớp** trong repo BTL Cloud (Express 5 + Prisma 6 + MySQL 8.4 + S3/SeaweedFS + React 19/Vite). Làm **đầy đủ, chạy được, có test**, không skeleton, không pseudocode.

- Lớp 1: SHA-256 theo stream, chặn hoặc cảnh báo trùng chính xác.
- Lớp 2: trích chữ PDF/DOCX/PPTX trong worker, shingle 5 từ, MinHash 128, cảnh báo gần trùng (không bao giờ chặn).
- Tích hợp upload (API-10) và thay tệp (API-12), lưu fingerprint, chính sách chặn, đồng thời, riêng tư, UI cảnh báo và 409, backfill, test, benchmark.

## 2. Repository, nhánh, baseline

- Repo: `https://github.com/august0362/btl_cloud`. Baseline code: `origin/main` @ `2f1ebbd`.
- Phase 0 merge commit: **`<P0_SHA>`** (owner điền). Kiểm `git log` có commit này trước khi làm.
- Tạo nhánh `feature/duplicate-detection` từ `<P0_SHA>`. Commit nhỏ, rõ ràng. Không push vào `main`, không merge. Cuối cùng mở **một PR** vào `main` để owner review.

## 3. Đọc trước khi code (theo thứ tự)

1. `docs/features/SHARED_CONTRACTS.md` — toàn bộ, đặc biệt §5 (schema), §6 (hợp đồng chung), §9 (sở hữu file), §13 (Decision Log).
2. `docs/features/DUPLICATE_DETECTION_SPEC.md` — **đặc tả chính**, làm đúng từng mục.
3. `docs/features/ACCEPTANCE_AND_ROLLOUT.md` §2, §3, §5.1, §6 (G1), §7.
4. `docs/ARCHITECTURE.md` §A6.3 (upload), §A7 (API, envelope lỗi), §A11; `README.md` (cách chạy test, quy tắc DB).
5. Code hiện có: `backend/src/modules/documents/*`, `modules/files/*`, `container.ts`, `test/integration/*`, `test/helpers/*`.

## 4. Yêu cầu

**Chức năng:** DUP-FR-001…041 (DUP §10). Điểm bắt buộc:
- SHA-256 mọi chế độ; `DUPLICATE_MODE` `off|warn|block`, mặc định `warn`.
- Phạm vi so **luôn** là `duplicateScopeSql(uploaderId)`; không đường code nào so với Private của người khác.
- **Quy tắc chặn (DR-05):** match chặn được khi `ownedByYou` **hoặc** (`match` PUBLIC **và** `newVisibility` PUBLIC). `newVisibility` = visibility trong form (upload) hoặc visibility hiện tại của tài liệu (thay tệp). Còn lại chỉ `WARNING`.
- `block`: kiểm sớm trước PutObject; kiểm lại trong transaction `READ COMMITTED` có `SELECT … FROM users WHERE id = ? FOR UPDATE`; fingerprint ghi cùng transaction với document (INV-F1).
- Lớp 2 trong `worker_threads`: 1 job/instance, hàng đợi 3, deadline 15 s, heap 192/32 MB, giới hạn DUP §5.2 (**PDF ≤ 10 MiB**, ≤ 100 trang). Lỗi Lớp 2 không bao giờ làm upload thất bại. `SKIPPED` không bao giờ hiển thị là 0%.
- MinHash đúng pseudocode DUP §6.2 (K=128, P=2³¹−1, `mulAddMod`, seed cố định), `algo_version = 1`.
- Backfill thủ công, idempotent, không xoá gì (DUP §4.7).

**Phi chức năng:** DUP-NFR-01…08. Không lưu chữ trích ra; log không có tiêu đề, tên tệp, nội dung.

## 5. Hợp đồng

- **DB:** dùng đúng `DocumentFingerprint` của Phase 0. **Không** sửa `schema.prisma`, không tạo migration.
- **Repository:** dùng `insert(…, db)` / `updateFile(…, db)` có sẵn tham số transaction. Không sửa `document.repository.ts`. Truy vấn fingerprint viết trong `modules/duplicates/`.
- **API:** response 2xx = `DocumentDto` + `duplicateCheck` (DUP §8.1). 409 `DUPLICATE_DOCUMENT` với `error.duplicates` = các match chặn được, ≤ 5 (DUP §8.2): ném `AppError` với trường `duplicates` (đường ống in đã có từ Phase 0). Thứ tự lỗi cũ (401/403/404/400/413/415) giữ nguyên trước 409.
- **Contract test:** thêm `uploadResultSchema` (strict) trong `test/helpers/contract.ts`; không sửa schema cũ.
- **Log:** `duplicates.check`, `duplicates.text_skipped`, `duplicates.blocked` (DUP §8.3).

## 6. File bạn được sửa

`backend/src/modules/duplicates/**` (mới) · `documents.service.ts` (constructor, `create`, `replaceFile`) · `documents.controller.ts` (`create`, `replaceFile`) · `container.ts` (chỉ trong khối `// Feature A` và dòng khởi tạo `DocumentService`) · `backend/package.json` + `package-lock.json` (chỉ thêm `pdfjs-dist` **6.5.438** pin chính xác) · `backend/scripts/backfill-fingerprints.ts` · `scripts/eval/duplicate-eval.mjs` · `test/helpers/contract.ts` (chỉ thêm) · test mới `backend/test/**/duplicates-*.test.ts` · `frontend/src/api/duplicates.ts`, `api/errors.ts`, `api/documents.ts` (kiểu trả về upload/replace), `lib/errorMessages.ts`, `pages/UploadPage.tsx`, `pages/EditDocumentPage.tsx` + test frontend tương ứng.

## 7. File không được sửa

Mọi file đóng băng ở SHARED §9: `schema.prisma`, `migrations/**`, `lib/text-normalize.ts`, `document.scope.ts`, `document.repository.ts`, `env.ts`, `errors.ts`, `error-handler.ts`, `database-schema.test.ts`, `test/integration/context.ts`. Mọi file của Agent 2 (`modules/recommendations/**`, `documents.routes.ts`, `documents.schemas.ts`, `app.ts`, `server.ts`, `request-context.ts`, `module-of.ts`, `DocumentListPages.tsx`, `DocumentDetailPage.tsx`, `SearchBar.tsx`, …). `docs/**`. File không có trong SHARED §9 → không sửa.

Cần sửa file đóng băng hoặc thấy hợp đồng chung sai/thiếu → **dừng phần đó, báo BLOCKER** (mục 12), không tự thiết kế lại.

## 8. Ràng buộc owner đã chốt

DR-02 `pdfjs-dist@6.5.438`, `isEvalSupported: false`, không dùng `@napi-rs/canvas` · DR-05 quy tắc chặn ở mục 4, rollout `warn` · DR-07 (khoá khác user), DR-13 (kiểm khi đổi visibility) **không làm** · không thêm hạ tầng, service, hàng đợi ngoài; không OCR; không deep learning · `NEAR_THRESHOLD = 0.6` là tạm, nằm trong `duplicate.policy.ts`.

## 9. Milestone

| # | Việc | Xong khi |
|---|---|---|
| M1 | **Spike S-1:** worker chạy được trong `tsx watch`, vitest và `dist/`; entry `pdfjs-dist` cho Node (thử `legacy/build/pdf.mjs`), `isEvalSupported` có hiệu lực | Kết quả ghi trong PR (U-06) |
| M2 | SHA-256 stream, tra trùng chính xác, chế độ, quy tắc chặn, transaction + khoá, 409, `duplicateCheck` | DUP-T-01…13, 26, 27, 29, 31…34 |
| M3 | Trích DOCX/PPTX/PDF trong worker, giới hạn, trạng thái/lý do | DUP-T-14…18, 25 |
| M4 | MinHash, `text_sha256`, quét ứng viên có giới hạn | DUP-T-19…24 |
| M5 | Frontend 409/WARNING/SKIPPED | DUP-T-30 |
| M6 | Backfill, script DUP-EVAL, BENCH-A1/A2/A3 local | DUP-T-28; số đo ghi trong PR |

## 10. Nghiệm thu và lệnh chạy

Đạt toàn bộ DUP-T-01…34 (ACCEPTANCE §3) và Gate G1. Chạy và dán kết quả thật:

```bash
npm ci
npm --prefix backend run lint && npm --prefix backend run typecheck
npm --prefix backend test
npm --prefix backend run test:integration     # cần MySQL + SeaweedFS local; chỉ dùng DB btl_cloud_test
npm --prefix backend run build
npm --prefix frontend run lint && npm --prefix frontend run typecheck
npm --prefix frontend test && npm --prefix frontend run build
```

DUP-T-09 (đồng thời): dựng 2 app trong cùng test với 2 `PrismaClient` riêng trỏ cùng DB, gửi song song, lặp 20 lần.
Không có MySQL/SeaweedFS → ghi rõ "integration CHƯA CHẠY", không tuyên bố PASS.

## 11. Lỗi và tình huống biên

Theo DUP §4.6 và §12. Nhắc lại các điểm dễ sai: xoá object mới (best-effort, log `storage.orphan`) khi 409 hoặc transaction lỗi; chờ worker kết thúc/terminate trước khi `finally` xoá tmp; slide PPTX sắp theo số; ZIP bomb dừng ở 10/32 MiB đã giải nén đếm thật; PDF mã hoá → `ENCRYPTED`, hỏng → `MALFORMED`, upload vẫn 201; `excludeId` khi thay tệp.

## 12. Báo cáo hoàn thành (trong mô tả PR)

1. Tóm tắt thay đổi theo milestone; danh sách file đã sửa (đối chiếu mục 6).
2. Lệnh đã chạy + kết quả (số test pass/fail/skip). Ghi rõ cái nào chưa chạy và lý do.
3. Kết quả spike S-1; BENCH-A1/A2/A3 (máy, Node, số đo); DUP-EVAL nếu có dữ liệu (DR-09), không có thì ghi "chưa có dữ liệu".
4. Sai lệch so với spec (nếu có) và lý do; giới hạn và rủi ro còn lại.
5. **BLOCKER** (nếu có): file/hợp đồng nào, vấn đề gì, đề xuất, phần nào đã dừng.
6. Nội dung cần integrator cập nhật vào `docs/`.

## 13. Điều kiện dừng và điều cấm

**Dừng và báo** khi: Phase 0 chưa có trên `main`; cần sửa file đóng băng hoặc file của Agent 2; spec mâu thuẫn hoặc thiếu; `pdfjs-dist@6.5.438` không chạy được trong worker (khi đó làm xong phần còn lại, PDF trả `SKIPPED/UNSUPPORTED`, báo BLOCKER); test cũ vỡ mà không sửa được trong phạm vi file của bạn.

**Tuyệt đối không:** merge hoặc push vào `main`; sửa schema/migration/hợp đồng chung; chạy `prisma migrate reset`/`migrate dev`/`db push` trên DB khác `*_test`; reset hay xoá dữ liệu `btl_cloud`, `btl_cloud_load`; chạm AWS (S3, EC2, RDS, `app.env`); đọc hay in secret; thêm dependency khác `pdfjs-dist`; lưu chữ trích ra; sửa code của Agent 2; tuyên bố PASS khi chưa chạy.
