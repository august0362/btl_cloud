# BTL Cloud

Bài tập lớn môn Điện Toán Đám Mây.

## Quy trình đóng góp

- Không push trực tiếp lên `main`; tạo nhánh `feature/*`, `fix/*` hoặc `chore/*` rồi mở Pull Request.
- Mọi Pull Request vào `main` phải qua job CI `ci-required` và được code owner (`@august0362`) duyệt.
- CI tự nhận diện dự án (Node.js, Python, Docker) và chạy lint/test/build tương ứng — xem `.github/workflows/ci.yml`.
