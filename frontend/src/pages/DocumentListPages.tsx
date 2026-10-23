import { useCallback } from "react";
import { useLocation } from "react-router";
import { documentsApi } from "../api/documents";
import { useAuth } from "../auth/context";
import { DocumentCard, MyDocumentList } from "../components/documents";
import { Pagination } from "../components/Pagination";
import { SearchBar } from "../components/SearchBar";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  LinkButton,
  Spinner,
} from "../components/ui";
import { useDeleteDocument } from "../hooks/useDeleteDocument";
import { useDocumentFilters } from "../hooks/useDocumentFilters";
import { useDownload } from "../hooks/useDownload";
import { usePageTitle } from "../hooks/usePageTitle";
import { useResource } from "../hooks/useResource";
import { errorMessage } from "../lib/errorMessages";

function DocumentListPage({ mine }: { mine: boolean }) {
  const title = mine ? "Tài liệu của tôi" : "Khám phá tài liệu học tập";
  usePageTitle(mine ? title : "Khám phá tài liệu");
  const { user } = useAuth();
  const location = useLocation();
  const { filters, update, clear, key } = useDocumentFilters(mine);
  const loader = useCallback(
    (signal: AbortSignal) => {
      // Cookie identity changes the server's isOwner field; refetch after login/logout.
      void user?.id;
      return mine
        ? documentsApi.listMine(filters, signal)
        : documentsApi.searchPublic(filters, signal);
    },
    [mine, filters, user?.id],
  );
  const { data, error, loading, reload } = useResource(loader);
  const download = useDownload();
  const deletion = useDeleteDocument(() => {
    if (data?.items.length === 1 && (filters.page ?? 1) > 1)
      update({ page: (filters.page ?? 1) - 1 });
    else reload();
  });
  const filtered = Boolean(
    filters.q ||
      filters.fileType ||
      filters.visibility ||
      filters.sort === "title",
  );
  const loginHref = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1 tabIndex={-1}>{title}</h1>
          {!mine && (
            <p className="muted">
              Tìm tài liệu được chia sẻ công khai để học tập và nghiên cứu.
            </p>
          )}
        </div>
        {mine && <LinkButton to="/upload">Tải lên tài liệu</LinkButton>}
      </div>
      <SearchBar key={key} filters={filters} mine={mine} onChange={update} />
      {error ? (
        <Alert
          title={
            mine
              ? "Không thể tải tài liệu của bạn."
              : "Không thể tải danh sách tài liệu."
          }
        >
          <p>{errorMessage(error)}</p>
          <Button variant="secondary" onClick={reload}>
            Thử lại
          </Button>
        </Alert>
      ) : (
        <section aria-label="Danh sách tài liệu" aria-busy={loading}>
          {data && (
            <p className="result-count">
              {mine
                ? `${data.totalItems} tài liệu`
                : `Tìm thấy ${data.totalItems} tài liệu`}
            </p>
          )}
          {loading && !data ? (
            mine ? (
              <Spinner />
            ) : (
              <div
                className="document-grid"
                role="status"
                aria-label="Đang tải tài liệu"
              >
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="document-card skeleton" key={index} />
                ))}
              </div>
            )
          ) : data?.items.length ? (
            <div className={loading ? "stale-results" : undefined}>
              {mine ? (
                <MyDocumentList
                  items={data.items}
                  onDownload={download}
                  onDelete={deletion.open}
                />
              ) : (
                <div className="document-grid">
                  {data.items.map((item) => (
                    <DocumentCard
                      key={item.id}
                      document={item}
                      isAuthenticated={Boolean(user)}
                      loginHref={loginHref}
                      onDownload={() => void download(item.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              title={
                filtered
                  ? mine
                    ? "Không có tài liệu phù hợp bộ lọc."
                    : `Không tìm thấy tài liệu phù hợp với “${filters.q ?? ""}”.`
                  : mine
                    ? "Bạn chưa có tài liệu nào."
                    : "Chưa có tài liệu công khai nào."
              }
              action={
                filtered ? (
                  <Button variant="secondary" onClick={clear}>
                    Xoá bộ lọc
                  </Button>
                ) : mine ? (
                  <LinkButton to="/upload">
                    Tải lên tài liệu đầu tiên
                  </LinkButton>
                ) : user ? (
                  <LinkButton to="/upload">Tải lên tài liệu</LinkButton>
                ) : undefined
              }
            />
          )}
          {data && (
            <Pagination
              page={filters.page ?? 1}
              totalPages={data.totalPages}
              onPageChange={(page) => update({ page })}
            />
          )}
        </section>
      )}
      <ConfirmDialog
        open={Boolean(deletion.target)}
        title="Xoá vĩnh viễn tài liệu?"
        message={`Tài liệu “${deletion.target?.title ?? ""}” và tệp đính kèm sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác.`}
        confirmLabel="Xoá vĩnh viễn"
        tone="danger"
        loading={deletion.busy}
        error={deletion.error}
        onCancel={deletion.cancel}
        onConfirm={() => void deletion.confirm()}
      />
    </>
  );
}
export function HomePage() {
  return <DocumentListPage mine={false} />;
}
export function MyDocumentsPage() {
  return <DocumentListPage mine />;
}
