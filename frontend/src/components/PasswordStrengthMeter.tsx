import { passwordStrength, type PasswordStrengthLevel } from "../lib/passwordStrength";
import styles from "./PasswordStrengthMeter.module.css";

const labels: Record<PasswordStrengthLevel, string> = {
  INVALID: "Quá ngắn",
  WEAK: "Yếu",
  MEDIUM: "Trung bình",
  STRONG: "Mạnh",
};

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { level } = passwordStrength(password);
  return (
    <div className={styles.meter} data-level={level}>
      <p role="status" aria-live="polite" aria-atomic="true">
        Độ mạnh mật khẩu: <strong>{labels[level]}</strong>
      </p>
      <div className={styles.track} aria-hidden="true">
        <span className={styles.fill} />
      </div>
      <p className="hint">
        Chỉ là gợi ý theo ba quy tắc đơn giản, không phải đánh giá bảo mật đầy đủ.
      </p>
    </div>
  );
}
