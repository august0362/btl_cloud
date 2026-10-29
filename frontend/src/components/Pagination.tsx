import { Button } from "./ui";

export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => start + index,
  );
  return (
    <nav className="pagination" aria-label="Phân trang">
      <Button
        requiresBackend
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        « Trước
      </Button>
      {pages.map((number) => (
        <Button
          requiresBackend
          key={number}
          variant={number === page ? "primary" : "ghost"}
          aria-current={number === page ? "page" : undefined}
          aria-label={`Trang ${number}`}
          onClick={() => onPageChange(number)}
        >
          {number}
        </Button>
      ))}
      <Button
        requiresBackend
        variant="secondary"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Sau »
      </Button>
    </nav>
  );
}
