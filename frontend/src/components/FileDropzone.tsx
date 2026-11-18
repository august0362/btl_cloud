import { useId, useRef, useState } from "react";
import { FILE_ACCEPT } from "../lib/constants";
import { formatSize } from "../lib/format";
import { Icon } from "./Icon";
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
  const extension = file?.name.includes(".") ? file.name.split(".").pop()?.toUpperCase() : undefined;
  const choose = (
    <Button
      variant="secondary"
      disabled={disabled}
      onClick={() => input.current?.click()}
    >
      {file ? <><Icon name="swap" size={18} />Đổi tệp</> : <><Icon name="upload" size={18} />Chọn tệp</>}
    </Button>
  );
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>Tệp tài liệu *</label>
        <span className="limit">Giới hạn: 1 tệp · Tối đa 50 MiB</span>
      </div>
      <div
        className={`dropzone ${file ? "dropzone--filled" : ""} ${dragging ? "dropzone--active" : ""}`}
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
        {file ? (
          <div className="file-tile">
            <span className="dropzone__icon" aria-hidden="true"><Icon name="file" size={24} /></span>
            <div className="file-tile__body">
              <span className="file-tile__name">
                <strong className="selected-file">{file.name}</strong>
                {extension && <span className="tag">{extension}</span>}
              </span>
              <span className="file-tile__meta">
                {formatSize(file.size)} ({file.size.toLocaleString("vi-VN")} bytes){!error && " · Sẵn sàng gửi"}
              </span>
            </div>
            {choose}
          </div>
        ) : (
          <>
            <span className="dropzone__icon" aria-hidden="true"><Icon name="upload" size={24} /></span>
            <p>Kéo thả tệp vào đây hoặc</p>
            {choose}
          </>
        )}
        <p className="formats">
          <span>Định dạng hỗ trợ:</span>
          <span>PDF (.pdf)</span>
          <span>Word (.docx)</span>
          <span>PowerPoint (.pptx)</span>
        </p>
      </div>
      <span id={`${id}-message`} className={error ? "field-error" : "hint"}>
        {error || "Một tệp cho mỗi lần tải lên."}
      </span>
    </div>
  );
}
