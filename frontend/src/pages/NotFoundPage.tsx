import { Icon } from "../components/Icon";
import { LinkButton } from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";

export function NotFoundPage() {
  usePageTitle("Không tìm thấy trang");
  return (
    <section className="empty-state">
      <span className="brand-mark" aria-hidden="true"><Icon name="search" size={24} /></span>
      <p className="eyebrow">Lỗi 404</p>
      <h1 tabIndex={-1}>Không tìm thấy trang</h1>
      <p>Đường dẫn không tồn tại hoặc đã bị thay đổi.</p>
      <LinkButton to="/">Về trang Khám phá</LinkButton>
    </section>
  );
}
