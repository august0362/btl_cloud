import { useId } from "react";
import { useServiceStatus } from "../hooks/useServiceStatus";
import { retryServices, statusDescription, statusLabel } from "../hooks/serviceActions";
import styles from "./ServiceStatus.module.css";

export function ServiceIndicator() {
  const snapshot = useServiceStatus();
  const id = useId();
  return <span className={styles.indicator} data-state={snapshot.state} tabIndex={0}
    aria-label={`Kết nối: ${statusLabel(snapshot.state)}`} aria-describedby={id}>
    <span className={styles.dot} aria-hidden="true">{snapshot.state === "online" ? "✓" : snapshot.state === "degraded" ? "!" : snapshot.state === "offline" ? "×" : "↻"}</span>
    <span aria-live="polite">{statusLabel(snapshot.state)}</span>
    <span id={id} role="tooltip" className={styles.tooltip}>{statusDescription(snapshot)}</span>
  </span>;
}

export function ServiceNotice() {
  const snapshot = useServiceStatus();
  if (!snapshot.checked || snapshot.state === "online") return null;
  return <aside className={styles.notice} data-state={snapshot.state} aria-label="Thông báo kết nối">
    <span role="status">{statusDescription(snapshot)} {snapshot.unavailable && "Nội dung đang nhập vẫn được giữ; thao tác gửi sẽ mở lại khi kết nối ổn định."}</span>
    <button className="button button--secondary" type="button" onClick={retryServices}>Thử kết nối lại</button>
  </aside>;
}
