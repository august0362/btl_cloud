import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link, type LinkProps } from "react-router";

export function Button({
  variant = "primary",
  loading = false,
  children,
  disabled,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      type={type}
      className={`button button--${variant} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && (
        <span className="spinner spinner--small" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
export function LinkButton({ className = "", ...props }: LinkProps) {
  return <Link {...props} className={`button button--primary ${className}`} />;
}
export function Spinner({ label = "Đang tải…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}
export function Alert({
  children,
  tone = "danger",
  title,
}: {
  children?: ReactNode;
  tone?: "danger" | "info" | "success";
  title?: string;
}) {
  return (
    <div
      className={`alert alert--${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      {title && <strong>{title}</strong>}
      {children && <div>{children}</div>}
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
type FieldProps = { label: string; error?: string; hint?: string };
export function TextField({
  label,
  error,
  hint,
  id,
  required,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className="field">
      <label htmlFor={fieldId}>
        {label}
        {required && " *"}
      </label>
      <input
        {...props}
        id={fieldId}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${fieldId}-message` : undefined}
      />
      {(error || hint) && (
        <span
          id={`${fieldId}-message`}
          className={error ? "field-error" : "hint"}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}
export function PasswordField(
  props: InputHTMLAttributes<HTMLInputElement> & FieldProps,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-field">
      <TextField {...props} type={visible ? "text" : "password"} />
      <button
        className="password-toggle"
        type="button"
        disabled={props.disabled}
        aria-pressed={visible}
        aria-label={`${visible ? "Ẩn" : "Hiện"} ${props.label.toLowerCase()}`}
        onClick={() => setVisible((value) => !value)}
      >
        {visible ? "Ẩn" : "Hiện"}
      </button>
    </div>
  );
}
export function TextArea({
  label,
  error,
  hint,
  id,
  required,
  value,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <div className="field">
      <label htmlFor={fieldId}>
        {label}
        {required && " *"}
      </label>
      <textarea
        {...props}
        id={fieldId}
        value={value}
        required={required}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? `${fieldId}-message` : undefined}
      />
      <span className="hint counter">
        {[...String(value ?? "")].length}/2000
      </span>
      {(error || hint) && (
        <span
          id={`${fieldId}-message`}
          className={error ? "field-error" : "hint"}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}
export function Select({
  label,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const generatedId = useId();
  return (
    <div className="field">
      <label htmlFor={id ?? generatedId}>{label}</label>
      <select {...props} id={id ?? generatedId}>
        {children}
      </select>
    </div>
  );
}
export function ProgressBar({
  value,
  label = "Đang tải lên…",
}: {
  value: number;
  label?: string;
}) {
  return (
    <div className="upload-progress">
      <label>
        {label} {value}%<progress value={value} max={100} aria-label={label} />
      </label>
      <span className="sr-only" role="status">
        {Math.floor(value / 10) * 10}%
      </span>
      {value === 100 && <p className="hint">Đang chờ máy chủ xác nhận…</p>}
    </div>
  );
}
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "Huỷ",
  tone = "info",
  loading = false,
  error,
  errorAction,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "info";
  loading?: boolean;
  error?: string;
  errorAction?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) {
      const opener =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      element.showModal();
      cancelButton.current?.focus();
      const restore = () => opener?.focus();
      element.addEventListener("close", restore, { once: true });
    } else if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ),
        );
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!loading) onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={messageId}>{message}</p>
      {error && (
        <Alert>
          {error}
          {errorAction}
        </Alert>
      )}
      <div className="actions">
        <button
          ref={cancelButton}
          type="button"
          className="button button--secondary"
          disabled={loading}
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          loading={loading}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
