import { useId } from "react";
import type { Visibility } from "../api/types";

export function VisibilityPicker({
  value,
  onChange,
  error,
  disabled = false,
}: {
  value: Visibility | null;
  onChange: (value: Visibility) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset
      className="visibility-picker"
      disabled={disabled}
      aria-describedby={error ? `${id}-error` : undefined}
    >
      <legend>Chế độ hiển thị *</legend>
      {(["PUBLIC", "PRIVATE"] as const).map((visibility, index) => (
        <label key={visibility} className="radio-option">
          <input
            type="radio"
            name="visibility"
            value={visibility}
            checked={value === visibility}
            required
            aria-required="true"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={() => onChange(visibility)}
          />
          <span>
            <strong>{index === 0 ? "Công khai" : "Riêng tư"}</strong>
            <span className="hint">
              {index === 0
                ? "Mọi người đều tìm thấy; người dùng đã đăng nhập có thể tải xuống."
                : "Chỉ bạn xem và tải xuống được."}
            </span>
          </span>
        </label>
      ))}
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </fieldset>
  );
}
