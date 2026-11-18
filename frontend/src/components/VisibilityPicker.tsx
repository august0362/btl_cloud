import { useId } from "react";
import type { Visibility } from "../api/types";
import { Icon } from "./Icon";

const OPTIONS = {
  PUBLIC: {
    title: "Công khai",
    icon: "globe",
    description: "Mọi người tìm thấy và xem thông tin tài liệu; người dùng đã đăng nhập có thể tải xuống.",
    foot: "Phù hợp với tài liệu muốn chia sẻ",
  },
  PRIVATE: {
    title: "Riêng tư",
    icon: "lock",
    description: "Chỉ bạn xem và tải xuống. Không xuất hiện trong tìm kiếm hay gợi ý của người khác.",
    foot: "Phù hợp với ghi chú cá nhân, bản nháp",
  },
} as const;

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
      <span className="hint">Chọn ai được tìm thấy và tải tài liệu này.</span>
      <div className="visibility-options">
        {(["PUBLIC", "PRIVATE"] as const).map((visibility) => {
          const option = OPTIONS[visibility];
          return (
            <label key={visibility} className="radio-option">
              <input
                type="radio"
                name="visibility"
                value={visibility}
                checked={value === visibility}
                required
                aria-required="true"
                aria-invalid={Boolean(error)}
                aria-labelledby={`${id}-${visibility}-title`}
                aria-describedby={[`${id}-${visibility}-text`, error ? `${id}-error` : ""].filter(Boolean).join(" ")}
                onChange={() => onChange(visibility)}
              />
              <span className="radio-option__icon" aria-hidden="true"><Icon name={option.icon} size={22} /></span>
              <span className="radio-option__body">
                <span className="radio-option__title">
                  <span id={`${id}-${visibility}-title`}>{option.title}</span>
                  <span className="tag" aria-hidden="true">{visibility}</span>
                </span>
                <span className="hint" id={`${id}-${visibility}-text`}>{option.description}</span>
                <span className="radio-option__foot" aria-hidden="true">
                  <Icon name={visibility === "PUBLIC" ? "eye" : "shield"} size={14} />
                  {option.foot}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <span className="field-error" id={`${id}-error`}>
          {error}
        </span>
      )}
    </fieldset>
  );
}
