import { Button } from "./ui";

export function Pagination({
  page,
  totalPages,
  onPageChange,
  totalItems,
  pageSize,
  shown,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Optional server totals for the "Hiển thị x–y / N" summary. */
  totalItems?: number;
  pageSize?: number;
  shown?: number;
}) {
  if (totalPages <= 1) return null;
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, index) => start + index,
  );
  const first = pageSize ? (page - 1) * pageSize + 1 : undefined;
  return (
    <div className="pagination-bar">
      {totalItems !== undefined && first !== undefined && shown !== undefined && (
        <p className="pagination-bar__summary">
          Hiển thị <strong>{first}–{first + shown - 1}</strong> trong tổng số {totalItems} kết quả
        </p>
      )}
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
      <p className="pagination-bar__summary">Trang {page} / {totalPages}</p>
    </div>
  );
}
