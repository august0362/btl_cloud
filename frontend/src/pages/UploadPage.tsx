import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { documentsApi } from "../api/documents";
import type { Visibility } from "../api/types";
import { FileDropzone } from "../components/FileDropzone";
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
import { errorMessage, fieldErrors } from "../lib/errorMessages";
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
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<Visibility | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState("");
  const selectFile = (next: File) => {
    setFile(next);
    setErrors((value) => ({ ...value, file: validateFile(next) }));
    if (!title.trim() || title === autoTitle.current) {
      const nextTitle = titleFromFile(next);
      setTitle(nextTitle);
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
    if (hasErrors(clientErrors) || !file || !visibility) {
      focusFirstError(form.current);
      return;
    }
    lock.current = true;
    try {
      await upload.run((options) =>
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
      show({ tone: "success", message: "Tải lên thành công" });
      navigate("/me/documents");
    } catch (failure) {
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
      <h1 tabIndex={-1}>Tải lên tài liệu</h1>
      <p className="muted">
        Chọn tệp và quyết định ai được xem tài liệu của bạn.
      </p>
      {error && (
        <Alert tone={error === "Đã huỷ tải lên." ? "info" : "danger"}>
          {error}
        </Alert>
      )}
      <form ref={form} className="panel" noValidate onSubmit={submit}>
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
            rows={5}
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
          <div className="actions">
            <Button
              type="submit"
              loading={upload.busy}
              disabled={hasErrors(clientErrors)}
            >
              {upload.busy ? "Đang tải lên…" : "Tải lên"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/me/documents")}
            >
              Huỷ
            </Button>
          </div>
        </fieldset>
        {upload.busy && (
          <>
            <ProgressBar value={upload.progress} />
            <Button variant="secondary" onClick={upload.cancel}>
              Huỷ tải lên
            </Button>
          </>
        )}
      </form>
    </section>
  );
}
