import { ApiError } from "../api/errors";
import type { DuplicateMatchDto, DuplicateCheckDto } from "../api/duplicates";
import { useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { documentsApi } from "../api/documents";
import type { Visibility } from "../api/types";
import { FileDropzone } from "../components/FileDropzone";
import { Icon } from "../components/Icon";
import { VisibilityPicker } from "../components/VisibilityPicker";
import {
  Alert,
  Button,
  ProgressBar,
  TextArea,
  TextField,
} from "../components/ui";
import { usePageTitle } from "../hooks/usePageTitle";
import { useToast } from "../hooks/useToast";
import { useUploadTask } from "../hooks/useUploadTask";
import { errorMessage, fieldErrors, duplicateReasonMessages } from "../lib/errorMessages";
import { formatSize } from "../lib/format";
import {
  focusFirstError,
  hasErrors,
  titleFromFile,
  validateField,
  validateFile,
  type FormErrors,
} from "../lib/validation";

export function UploadPage() {
  usePageTitle("Tải lên tài liệu");
  const navigate = useNavigate();
  const { show } = useToast();
  const upload = useUploadTask();
  const form = useRef<HTMLFormElement>(null);
  const autoTitle = useRef("");
  const lock = useRef(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [titleIsAuto, setTitleIsAuto] = useState(false);
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState("");
  const [duplicates, setDuplicates] = useState<DuplicateMatchDto[]>([]);
  const selectFile = (next: File) => {
    setFile(next);
    setErrors((value) => ({ ...value, file: validateFile(next) }));
    // Prefill from the filename only while the user has not typed their own title.
    if (!title.trim() || title === autoTitle.current) {
      const nextTitle = titleFromFile(next);
      setTitle(nextTitle);
      setTitleIsAuto(Boolean(nextTitle));
      autoTitle.current = nextTitle;
      setErrors((value) => ({
        ...value,
        title: validateField("title", nextTitle),
      }));
    }
  };
  const clientErrors = {
    file: validateFile(file),
    title: validateField("title", title),
    description: validateField("description", description),
    visibility: validateField("visibility", visibility ?? ""),
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (lock.current) return;
    setErrors(clientErrors);
    setError("");
    setDuplicates([]);
    if (hasErrors(clientErrors) || !file || !visibility) {
      focusFirstError(form.current);
      return;
    }
    lock.current = true;
    try {
      const result = await upload.run((options) =>
        documentsApi.upload(
          {
            title: title.trim(),
            description: description.trim(),
            visibility,
            file,
          },
          options,
        ),
      );
      show({ tone: result.duplicateCheck?.result === 'WARNING' ? 'warning' : 'success', persist: result.duplicateCheck?.result === 'WARNING', message: <><span>Tải lên thành công</span><DuplicateNotice check={result.duplicateCheck} /></> });
      navigate("/me/documents");
    } catch (failure) {
      if (failure instanceof ApiError) setDuplicates(failure.duplicates);
      const fields = fieldErrors(failure);
      setErrors(fields);
      if (!hasErrors(fields)) setError(errorMessage(failure));
      focusFirstError(form.current);
    } finally {
      lock.current = false;
    }
  };
  return (
    <section className="form-page">
      <p className="crumbs"><strong>INT3319</strong> / Kho tài liệu / Tải lên</p>
      <div className="page-heading">
        <div>
          <h1 tabIndex={-1}>Tải lên tài liệu</h1>
          <p className="muted">
            Chọn tệp, đặt tiêu đề và quyết định ai được xem tài liệu của bạn.
          </p>
        </div>
        <span className="page-heading__note"><Icon name="shield" size={18} />Máy chủ kiểm tra trùng lặp sau khi nhận tệp</span>
      </div>
      {error && (
        <Alert tone={error === "Đã huỷ tải lên." ? "info" : "danger"}>
          {error}
          <DuplicateNotice matches={duplicates} blocked />
        </Alert>
      )}
      <form ref={form} className="form-card" noValidate onSubmit={submit}>
        <fieldset className="form-fields" disabled={upload.busy}>
          <FileDropzone
            file={file}
            onFileChange={selectFile}
            error={errors.file}
            disabled={upload.busy}
          />
          <TextField
            label="Tiêu đề"
            name="title"
            value={title}
            required
            error={errors.title}
            counter={`${[...title].length} / 200`}
            aside={titleIsAuto && title ? <span className="field-tag"><Icon name="sparkles" size={12} />Lấy từ tên tệp</span> : undefined}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleIsAuto(false);
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
            rows={4}
            aside={<span className="field-optional">(Tuỳ chọn)</span>}
            placeholder="Tóm tắt nội dung giúp người khác tìm thấy tài liệu."
            error={errors.description}
            onChange={(event) => {
              setDescription(event.target.value);
              if (errors.description)
                setErrors((value) => ({
                  ...value,
                  description: validateField("description", event.target.value),
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
            onChange={(value) => {
              setVisibility(value);
              setErrors((current) => ({ ...current, visibility: undefined }));
            }}
            error={errors.visibility}
            disabled={upload.busy}
          />
          <p className="hint">
            Sau khi gửi, máy chủ so khớp với tài liệu Công khai và tài liệu của bạn. Tài liệu chỉ được lưu khi máy chủ xác nhận thành công.
          </p>
          <div className="actions actions--end">
            <Button
              type="submit"
              loading={upload.busy}
              disabled={hasErrors(clientErrors)}
            >
              {!upload.busy && <Icon name="upload" size={18} />}
              {upload.busy ? "Đang tải lên…" : "Tải lên"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate("/me/documents")}
            >
              Huỷ
            </Button>
          </div>
        </fieldset>
        {upload.busy && (
          <>
            <ProgressBar
              value={upload.progress}
              detail={file ? `Đã gửi ≈ ${formatSize((file.size * upload.progress) / 100)} / ${formatSize(file.size)}` : undefined}
            />
            <Button variant="secondary" onClick={upload.cancel}>
              Huỷ tải lên
            </Button>
          </>
        )}
      </form>
    </section>
  );
}


export function DuplicateNotice({ check, matches = [], blocked = false }: { check?: DuplicateCheckDto; matches?: DuplicateMatchDto[]; blocked?: boolean }) {
  if (check?.mode === 'off') return null;
  const unique = new Map<string, DuplicateMatchDto>();
  for (const match of check ? [...check.exactMatches, ...check.textMatches] : matches) {
    const previous = unique.get(match.documentId);
    if (!previous || match.similarity > previous.similarity) unique.set(match.documentId, match);
  }
  const all = [...unique.values()];
  return <>
    {all.length > 0 && <span className="dup-list">{blocked ? 'Đã từ chối tải lên. Tài liệu trùng với:' : 'Cảnh báo trùng nội dung với:'}
      <span role="list" className="dup-list">{all.map((match) => <span role="listitem" className="dup-item" key={match.documentId}>
        <Link to={`/documents/${match.documentId}`}>{match.title}</Link>
        <span className={`badge ${match.ownedByYou ? 'badge--owner' : 'badge--public'}`}>{match.ownedByYou ? 'của bạn' : 'công khai'}</span>
        <span>{match.matchType === 'EXACT' ? 'Trùng tệp 100%' : match.matchType === 'SAME_TEXT' ? 'Trùng nội dung chữ 100%' : <>Giống {(match.similarity * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}% phần chữ đã phân tích (ước tính){check?.textAnalysis.status === 'PARTIAL' && ' (chỉ phân tích phần đầu)'}</>}</span>
      </span>)}</span>
    </span>}
    {check?.textAnalysis.status === 'SKIPPED' && <span className="dup-list">Chưa kiểm tra được trùng nội dung: {duplicateReasonMessages[check.textAnalysis.reason ?? 'ERROR'] ?? duplicateReasonMessages.ERROR}</span>}
  </>;
}
