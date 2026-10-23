import { LinkButton } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";

export function NotFoundPage() {
  usePageTitle("Không tìm thấy trang");
  return (
    <section className="empty-state">
      <h1 tabIndex={-1}>Không tìm thấy trang</h1>
      <p>Đường dẫn không tồn tại hoặc đã bị thay đổi.</p>
      <LinkButton to="/">Về trang Khám phá</LinkButton>
    </section>
  );
}
