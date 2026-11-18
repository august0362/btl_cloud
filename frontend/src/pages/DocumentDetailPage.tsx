import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { recommendationsApi } from "../api/recommendations";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/errors";
import { useAuth } from "../auth/context";
import {
  DocumentMeta,
  DownloadAction,
  FileTypeBadge,
  VisibilityBadge,
} from "../components/documents";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  Spinner,
} from "../components/ui";
import { useDeleteDocument } from "../hooks/useDeleteDocument";
import { useDownload } from "../hooks/useDownload";
import { usePageTitle } from "../hooks/usePageTitle";
import { useResource } from "../hooks/useResource";
import { errorMessage } from "../lib/errorMessages";
import { formatSize } from "../lib/format";
import { Icon } from "../components/Icon";

export function DocumentDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const loader = useCallback(
    (signal: AbortSignal) => {
      // Recheck ownership with the current cookie after login/logout.
      void user?.id;
      return documentsApi.get(id, signal);
    },
    [id, user?.id],
  );
  const { data, loading, error, reload } = useResource(loader, `${id}:${user?.id ?? "guest"}`);
  const download = useDownload();
  const deletion = useDeleteDocument(() => navigate("/me/documents"));
  usePageTitle(data?.title ?? "Chi tiết tài liệu");
  if (loading && !data)
    return (
      <>
        <h1 tabIndex={-1}>Chi tiết tài liệu</h1>
        <Spinner />
      </>
    );
  if (error instanceof ApiError && error.status === 404)
    return (
      <>
        <h1 tabIndex={-1}>Không tìm thấy tài liệu</h1>
        <EmptyState
          title="Không tìm thấy tài liệu hoặc bạn không có quyền xem."
          action={<Link className="button button--primary" to="/">Về trang Khám phá</Link>}
        />
      </>
    );
  if (!data)
    return (
      <>
        <h1 tabIndex={-1}>Chi tiết tài liệu</h1>
        <Alert>
          <p>{errorMessage(error)}</p>
          <Button variant="secondary" onClick={reload}>
            Thử lại
          </Button>
        </Alert>
      </>
    );
  return (
    <>
      {error != null && <Alert tone="info">{errorMessage(error)} Nội dung đã tải được giữ bên dưới.</Alert>}
      <Button
        variant="ghost"
        className="back-link"
        onClick={() => {
          if (window.history.state?.idx > 0) navigate(-1);
          else navigate("/");
        }}
      >
        <Icon name="arrowLeft" size={18} />
        Quay lại
      </Button>
      <div className="detail-layout">
        <article className="panel detail">
          <div className="badges">
            <FileTypeBadge fileType={data.fileType} />
            <span className="badge badge--size">{formatSize(data.sizeBytes)}</span>
            {data.isOwner && <VisibilityBadge visibility={data.visibility} />}
            {data.isOwner && <span className="badge badge--owner">Của bạn</span>}
          </div>
          <h1 tabIndex={-1}>{data.title}</h1>
          <h2>Mô tả</h2>
          <p className="preserve-lines">
            {data.description || "Không có mô tả."}
          </p>
          <DocumentMeta document={data} detailed />
          <div className="actions">
            <DownloadAction
              isAuthenticated={Boolean(user)}
              loginHref={`/login?redirect=${encodeURIComponent(`/documents/${id}`)}`}
              onDownload={() => void download(id)}
              variant="primary"
            />
            {data.isOwner && (
              <>
                <Link
                  className="button button--secondary"
                  to={`/documents/${id}/edit`}
                >
                  <Icon name="edit" size={18} />
                  Chỉnh sửa
                </Link>
                <Button requiresBackend variant="danger" onClick={() => deletion.open(data)}>
                  Xoá
                </Button>
              </>
            )}
          </div>
        </article>
        <aside className="discover__aside" aria-label="Thông tin thêm">
          <RelatedDocuments id={id} />
          <section className="side-card" aria-labelledby="detail-access">
            <div className="side-card__head">
              <h2 id="detail-access"><Icon name="info" size={18} />Quyền truy cập</h2>
            </div>
            <ul className="rule-list">
              <li><Icon name="check" size={16} />Tệp được tải qua máy chủ sau khi kiểm tra phiên đăng nhập và quyền xem.</li>
              <li><Icon name="check" size={16} />Chỉ chủ sở hữu được sửa, thay tệp hoặc xoá tài liệu.</li>
            </ul>
          </section>
        </aside>
      </div>
      <ConfirmDialog
        open={Boolean(deletion.target)}
        title="Xoá vĩnh viễn tài liệu?"
        message={`Tài liệu “${data.title}” và tệp đính kèm sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác.`}
        confirmLabel="Xoá vĩnh viễn"
        tone="danger"
        error={deletion.error}
        loading={deletion.busy}
        onCancel={deletion.cancel}
        onConfirm={() => void deletion.confirm()}
      />
    </>
  );
}

function RelatedDocuments({ id }: { id: string }) {
  const { user } = useAuth();
  const loader = useCallback((signal: AbortSignal) => recommendationsApi.related(id, 6, signal), [id]);
  const { data, error } = useResource(loader, `${id}:${user?.id ?? "guest"}`);
  if (error || !data?.items?.length) return null;
  return (
    <section className="side-card side-card--muted" aria-labelledby="related-heading">
      <div className="side-card__head">
        <h2 id="related-heading"><Icon name="sparkles" size={18} />Tài liệu liên quan</h2>
      </div>
      <ul className="mini-list">
        {data.items.map((doc) => (
          <li key={doc.id}>
            <Link to={`/documents/${doc.id}`}>{doc.title}</Link>
            <small>{doc.fileType} · {formatSize(doc.sizeBytes)}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
