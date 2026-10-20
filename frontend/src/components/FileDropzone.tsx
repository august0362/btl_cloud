import { useId, useRef, useState } from "react";
import { FILE_ACCEPT } from "../lib/constants";
import { formatSize } from "../lib/format";
import { Button } from "./ui";

export function FileDropzone({
  file,
  onFileChange,
  error,
  disabled = false,
}: {
  file: File | null;
  onFileChange: (file: File) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>Tệp tài liệu *</label>
      <div
        className={`dropzone ${dragging ? "dropzone--active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!disabled && event.dataTransfer.files[0])
            onFileChange(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={input}
          className="sr-only"
          id={id}
          type="file"
          name="file"
          accept={FILE_ACCEPT}
          disabled={disabled}
          aria-required="true"
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-message`}
          onChange={(event) => {
            if (event.target.files?.[0]) onFileChange(event.target.files[0]);
            event.target.value = "";
          }}
        />
        <p>Kéo thả tệp vào đây hoặc</p>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          {file ? "Đổi tệp" : "Chọn tệp"}
        </Button>
        <p className="hint">PDF, DOCX, PPTX · tối đa 50 MB</p>
        {file && (
          <p className="selected-file">
            Đã chọn: <strong>{file.name}</strong> · {formatSize(file.size)}
          </p>
        )}
      </div>
      <span id={`${id}-message`} className={error ? "field-error" : "hint"}>
        {error || "Một tệp cho mỗi lần tải lên."}
      </span>
    </div>
  );
}
