import { useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router";
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
  const { data, loading, error, reload } = useResource(loader);
  const download = useDownload();
  const deletion = useDeleteDocument(() => navigate("/me/documents"));
  usePageTitle(data?.title ?? "Chi tiết tài liệu");
  if (loading)
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
          action={<Link to="/">Về trang Khám phá</Link>}
        />
      </>
    );
  if (error || !data)
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
      <Button
        variant="ghost"
        onClick={() => {
          if (window.history.state?.idx > 0) navigate(-1);
          else navigate("/");
        }}
      >
        ← Quay lại
      </Button>
      <article className="panel detail">
        <div className="badges">
          <FileTypeBadge fileType={data.fileType} />
          {data.isOwner && <VisibilityBadge visibility={data.visibility} />}
        </div>
        <h1 tabIndex={-1}>{data.title}</h1>
        <DocumentMeta document={data} detailed />
        <h2>Mô tả</h2>
        <p className="preserve-lines">
          {data.description || "Không có mô tả."}
        </p>
        <div className="actions">
          <DownloadAction
            isAuthenticated={Boolean(user)}
            loginHref={`/login?redirect=${encodeURIComponent(`/documents/${id}`)}`}
            onDownload={() => void download(id)}
          />
          {data.isOwner && (
            <>
              <Link
                className="button button--primary"
                to={`/documents/${id}/edit`}
              >
                Chỉnh sửa
              </Link>
              <Button variant="danger" onClick={() => deletion.open(data)}>
                Xoá
              </Button>
            </>
          )}
        </div>
      </article>
      <ConfirmDialog
        open={Boolean(deletion.target)}
        title="Xoá vĩnh viễn tài liệu?"
        message={`Tài liệu “${data.title}” và tệp đính kèm sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác.`}
        confirmLabel="Xoá vĩnh viễn"
        tone="danger"
        error={deletion.error}
        errorAction={
          deletion.conflict ? (
            <Button
              variant="secondary"
              onClick={() => {
                deletion.cancel();
                reload();
              }}
            >
              Tải lại
            </Button>
          ) : undefined
        }
        loading={deletion.busy}
        onCancel={deletion.cancel}
        onConfirm={() => void deletion.confirm()}
      />
    </>
  );
}
