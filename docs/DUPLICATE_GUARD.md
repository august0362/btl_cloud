# Duplicate guard — MVP (no training, no GPU)

This feature detects exact duplicate files for PDF, DOCX and PPTX using SHA-256. For DOCX/PPTX with at least 40 extracted words it also computes a normalized-text hash and a small 64-slot MinHash-style 5-word-shingle signature. It does **not** use a trained model, and the similarity score is lexical, not semantic or an AI confidence probability.

## Setup

1. Pull the changes, then run `npm --prefix backend run prisma:deploy` and `npm --prefix backend run prisma:generate`.
2. `DUPLICATE_UPLOAD_MODE=warn` (default) reports near/exact duplicates after uploading; all uploads remain allowed.
3. `DUPLICATE_UPLOAD_MODE=block` additionally rejects *byte-identical* duplicates with HTTP 409 `DUPLICATE_DOCUMENT`, before writing to S3 or inserting a document.
4. `DUPLICATE_UPLOAD_MODE=off` disables matching while continuing to index new uploads.

Only the user's own documents and documents that are public with active owners are searched. Private documents belonging to others are never matched or disclosed. A match does not expose a document ID/title. Replacement uses the same checks (excluding the replaced document).

## Limitations

- Exact-file checks cover all three formats, including scanned PDFs. PDF content/rewritten PDF, OCR, cross-format semantic comparisons, and AI embeddings are **not included yet**. Office parsing is best effort; large/unreadable XML degrades to byte hash.
- Similarity is an estimated overlap of word shingles. It may miss paraphrases, reorderings and distant duplicates. Near matches are warnings only, never auto-deleted.
- The near-match scan compares up to 500 available signatures. This is for a course-project-scale dataset, not a large global index.
- Existing documents are not backfilled until they are replaced/reuploaded. False positives and concurrency races are possible; do not automatically delete existing documents.
- Use 20–40 labelled pairs to assess false positives and false negatives before enabling block mode in production.
- Footprint: SHA-256 (64 hex chars), optional text hash (64 chars), optional signature (512 chars), and DB index overhead per document. No duplicate S3 object or model weight is stored for analysis.

## Demo

Upload a PDF; re-upload the same bytes under another filename. With mode `warn`, the second upload succeeds with a warning. With `block`, it receives HTTP 409 and does not create a new S3 object. A private document uploaded by another user is not exposed in the duplicate check.

For a genuinely semantic detector later: use an existing multilingual embedding model, collect labeled examples for threshold evaluation, and process only textual (non-scanned) files. Training is optional; it is not required for this MVP.
