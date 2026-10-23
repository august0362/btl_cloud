import { useCallback, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { documentsApi } from "../api/documents";
import { ApiError } from "../api/errors";
import type { DocumentDto, DocumentPatch, Visibility } from "../api/types";
import { FileDropzone } from "../components/FileDropzone";
import { VisibilityPicker } from "../components/VisibilityPicker";
import {
  Alert,
  Button,
  ConfirmDialog,
  EmptyState,
  ProgressBar,
  Spinner,
  TextArea,
  TextField,
} from "../components/ui";
import { useDeleteDocument } from "../hooks/useDeleteDocument";
import { usePageTitle } from "../hooks/usePageTitle";
import { useResource } from "../hooks/useResource";
import { useToast } from "../hooks/useToast";
import { useUploadTask } from "../hooks/useUploadTask";
import { errorMessage, fieldErrors } from "../lib/errorMessages";
import { formatDate, formatSize } from "../lib/format";
import {
  focusFirstError,
  hasErrors,
  validateField,
  validateFile,
  type FormErrors,
} from "../lib/validation";

function EditDocumentForm({
  initial,
  reload,
}: {
  initial: DocumentDto;
  reload: () => void;
}) {
  usePageTitle("Chỉnh sửa tài liệu");
  const [document, setDocument] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [metadataError, setMetadataError] = useState("");
  const [replacementError, setReplacementError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<"public" | "replace" | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const lock = useRef(false);
  const replacementLock = useRef(false);
  const upload = useUploadTask();
  const { show } = useToast();
  const navigate = useNavigate();
  const deletion = useDeleteDocument(() => navigate("/me/documents"));
  const patch: DocumentPatch = {};
  if (title.trim() !== document.title) patch.title = title.trim();
  if ((description.trim() || null) !== document.description)
    patch.description = description.trim() || null;
  if (visibility !== document.visibility) patch.visibility = visibility;
  const clientErrors = {
    title: validateField("title", title),
    description: validateField("description", description),
  };
  const unavailable = saving || upload.busy || deletion.busy;
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setMetadataError("");
    setConflict(false);
    setDialog(null);
    try {
      const updated = await documentsApi.update(document.id, patch);
      setDocument(updated);
      setTitle(updated.title);
      setDescription(updated.description ?? "");
      setVisibility(updated.visibility);
      show({ tone: "success", message: "Đã lưu thay đổi" });
    } catch (failure) {
      const fields = fieldErrors(failure);
      setErrors(fields);
      if (!hasErrors(fields)) setMetadataError(errorMessage(failure));
      if (failure instanceof ApiError && failure.code === "CONFLICT")
        setConflict(true);
      focusFirstError(form.current);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (unavailable || lock.current || !Object.keys(patch).length) return;
    setErrors(clientErrors);
    if (hasErrors(clientErrors)) {
      focusFirstError(form.current);
      return;
    }
    if (document.visibility === "PRIVATE" && visibility === "PUBLIC")
      setDialog("public");
    else void save();
  };
  const replace = async () => {
    if (!file || replacementLock.current) return;
    replacementLock.current = true;
    setDialog(null);
    setReplacementError("");
    setConflict(false);
    try {
      const updated = await upload.run((options) =>
        documentsApi.replaceFile(document.id, file, options),
      );
      setDocument(updated);
      setFile(null);
      setErrors((value) => ({ ...value, file: undefined }));
      show({ tone: "success", message: "Đã thay thế tệp" });
    } catch (failure) {
      const fields = fieldErrors(failure);
      setErrors((value) => ({ ...value, ...fields }));
      if (!hasErrors(fields))
        setReplacementError(
          failure instanceof ApiError && failure.code === "STORAGE_UNAVAILABLE"
            ? "Không thể thay thế tệp lúc này. Tệp hiện tại vẫn được giữ nguyên."
            : errorMessage(failure),
        );
      if (failure instanceof ApiError && failure.code === "CONFLICT")
        setConflict(true);
    } finally {
      replacementLock.current = false;
    }
  };
  return (
    <>
      <Link to={`/documents/${document.id}`}>← Quay lại tài liệu</Link>
      <h1 tabIndex={-1}>Chỉnh sửa tài liệu</h1>
      {conflict && (
        <Alert>
          <p>Tài liệu vừa được thay đổi. Tải lại dữ liệu trước khi tiếp tục.</p>
          <Button variant="secondary" onClick={reload}>
            Tải lại
          </Button>
        </Alert>
      )}
      <section className="panel">
        <h2>Thông tin tài liệu</h2>
        {metadataError && <Alert>{metadataError}</Alert>}
        <form ref={form} noValidate onSubmit={submit}>
          <fieldset className="form-fields" disabled={unavailable}>
            <TextField
              label="Tiêu đề"
              name="title"
              required
              value={title}
              error={errors.title}
              hint={`${[...title].length}/200`}
              onChange={(event) => {
                setTitle(event.target.value);
                if (errors.title)
                  setErrors((value) => ({
                    ...value,
                    title: validateField("title", event.target.value),
                  }));
              }}
              onBlur={() =>
                setErrors((value) => ({
                  ...value,
                  title: validateField("title", title),
                }))
              }
            />
            <TextArea
              label="Mô tả"
              name="description"
              value={description}
              error={errors.description}
              rows={4}
              onChange={(event) => {
                setDescription(event.target.value);
                if (errors.description)
                  setErrors((value) => ({
                    ...value,
                    description: validateField(
                      "description",
                      event.target.value,
                    ),
                  }));
              }}
              onBlur={() =>
                setErrors((value) => ({
                  ...value,
                  description: validateField("description", description),
                }))
              }
            />
            <VisibilityPicker
              value={visibility}
              onChange={setVisibility}
              error={errors.visibility}
              disabled={unavailable}
            />
            <Button
              type="submit"
              loading={saving}
              disabled={!Object.keys(patch).length || hasErrors(clientErrors)}
            >
              Lưu thay đổi
            </Button>
          </fieldset>
        </form>
      </section>
      <section className="panel">
        <h2>Thay thế tệp</h2>
        <p className="current-file">
          Tệp hiện tại: <strong>{document.originalFilename}</strong> ·{" "}
          {document.fileType} · {formatSize(document.sizeBytes)} · Phiên bản{" "}
          {document.fileVersion} · cập nhật {formatDate(document.fileUpdatedAt)}
        </p>
        <p className="hint">
          Chế độ hiển thị và thông tin được giữ nguyên. Thất bại thì giữ tệp cũ.
        </p>
        {replacementError && (
          <Alert
            tone={replacementError === "Đã huỷ tải lên." ? "info" : "danger"}
          >
            {replacementError}
          </Alert>
        )}
        <FileDropzone
          file={file}
          onFileChange={(value) => {
            setFile(value);
            setErrors((current) => ({ ...current, file: validateFile(value) }));
          }}
          error={errors.file}
          disabled={unavailable}
        />
        <Button
          disabled={unavailable || Boolean(validateFile(file))}
          onClick={() => setDialog("replace")}
        >
          Thay thế tệp
        </Button>
        {upload.busy && (
          <>
            <ProgressBar value={upload.progress} label="Đang thay thế tệp…" />
            <Button variant="secondary" onClick={upload.cancel}>
              Huỷ thay thế
            </Button>
          </>
        )}
      </section>
      <section className="panel danger-zone">
        <h2>Vùng nguy hiểm</h2>
        <p>Xoá vĩnh viễn tài liệu và tệp. Không thể hoàn tác.</p>
        <Button
          variant="danger"
          disabled={unavailable}
          onClick={() => deletion.open(document)}
        >
          Xoá vĩnh viễn
        </Button>
      </section>
      <ConfirmDialog
        open={dialog === "public"}
        title="Chuyển sang Công khai?"
        message="Mọi người sẽ tìm thấy tài liệu này và người dùng đã đăng nhập có thể tải xuống."
        confirmLabel="Chuyển sang Công khai"
        onCancel={() => setDialog(null)}
        onConfirm={() => void save()}
      />
      <ConfirmDialog
        open={dialog === "replace"}
        title="Thay thế tệp?"
        message={`Tệp hiện tại “${document.originalFilename}” sẽ được thay bằng “${file?.name ?? ""}”. Chế độ hiển thị và thông tin tài liệu được giữ nguyên.`}
        confirmLabel="Thay thế"
        onCancel={() => setDialog(null)}
        onConfirm={() => void replace()}
      />
      <ConfirmDialog
        open={Boolean(deletion.target)}
        title="Xoá vĩnh viễn tài liệu?"
        message={`Tài liệu “${document.title}” và tệp đính kèm sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn tác.`}
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
export function EditDocumentPage() {
  usePageTitle("Chỉnh sửa tài liệu");
  const { id = "" } = useParams();
  const loader = useCallback(
    (signal: AbortSignal) => documentsApi.get(id, signal),
    [id],
  );
  const { data, error, loading, reload } = useResource(loader);
  if (loading)
    return (
      <>
        <h1 tabIndex={-1}>Chỉnh sửa tài liệu</h1>
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
        <h1 tabIndex={-1}>Chỉnh sửa tài liệu</h1>
        <Alert>
          <p>{errorMessage(error)}</p>
          <Button variant="secondary" onClick={reload}>
            Thử lại
          </Button>
        </Alert>
      </>
    );
  if (!data.isOwner)
    return (
      <>
        <h1 tabIndex={-1}>Không có quyền chỉnh sửa</h1>
        <EmptyState
          title="Bạn không có quyền chỉnh sửa tài liệu này."
          action={<Link to={`/documents/${id}`}>Quay lại tài liệu</Link>}
        />
      </>
    );
  return (
    <div className="form-page">
      <EditDocumentForm
        key={`${data.id}:${data.updatedAt}:${data.fileVersion}`}
        initial={data}
        reload={reload}
      />
    </div>
  );
}
