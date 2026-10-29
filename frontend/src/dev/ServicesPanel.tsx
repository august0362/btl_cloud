import { useEffect, useState } from "react";
import type { BackendStatus, LocalServiceName, ProcessState } from "../api/localBackend";
import { useToast } from "../hooks/useToast";
import styles from "./LocalControls.module.css";

export const processLabel: Record<ProcessState, string> = {
  running: "Đang chạy", starting: "Đang khởi động", stopping: "Đang dừng", stopped: "Đã dừng", failed: "Lỗi",
};
export const serviceNames: Record<LocalServiceName | "controller", string> = {
  frontend: "Frontend", backend: "Backend", mysql: "MySQL", seaweedfs: "SeaweedFS", controller: "Controller",
};

export function ServicesPanel({ status }: { status: BackendStatus | null }) {
  const [service, setService] = useState("all");
  const [level, setLevel] = useState("all");
  const [clearedAt, setClearedAt] = useState(0);
  const { show } = useToast();
  const allLogs = status?.logs ?? [];
  const lastId = allLogs.at(-1)?.id ?? 0;
  useEffect(() => { if (lastId < clearedAt) setClearedAt(0); }, [lastId, clearedAt]);
  const logs = allLogs.filter((entry) => entry.id > clearedAt && (service === "all" || entry.service === service) && (level === "all" || entry.level === level));
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ at: new Date().toISOString(), mode: status?.mode,
        operation: status?.operation, services: status?.services, error: status?.lastError, logs }, null, 2));
      show({ tone: "success", message: "Đã sao chép chẩn đoán dịch vụ." });
    } catch { show({ tone: "danger", message: "Không sao chép được. Hãy cấp quyền clipboard hoặc xem backend/tmp/local-services.ndjson." }); }
  }
  return <div className={styles.services}>
    <p className="hint">Chế độ: {status?.mode ?? "chưa xác định"}. Controller: 127.0.0.1:3001. Chỉ dừng dịch vụ được launcher quản lý.</p>
    <div className={styles.grid}>
      {status?.services?.map((item) => <article className={styles.service} key={item.name} data-state={item.state}>
        <strong>{serviceNames[item.name]} · :{item.port}</strong>
        <span>{processLabel[item.state]}</span>
        <span className="hint">{item.managed ? `Được quản lý${item.pid ? ` · PID ${item.pid}` : ""}` : "Ngoài quyền quản lý"}</span>
        {item.lastError && <p role="alert">{item.lastError}</p>}
      </article>)}
    </div>
    {status?.lastError && <p role="alert">{status.lastError}</p>}
    {status?.logError && <p role="alert">{status.logError}</p>}
    <div className={styles.filters}>
      <label>Dịch vụ<select aria-label="Lọc dịch vụ" value={service} onChange={(event) => setService(event.target.value)}>
        <option value="all">Tất cả dịch vụ</option>
        {Object.entries(serviceNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>Mức log<select aria-label="Lọc mức log" value={level} onChange={(event) => setLevel(event.target.value)}>
        <option value="all">Tất cả mức</option>{["INFO", "WARN", "ERROR"].map((value) => <option key={value}>{value}</option>)}
      </select></label>
      <button type="button" className="button button--secondary" onClick={() => setClearedAt(allLogs.at(-1)?.id ?? 0)}>Xóa log hiển thị</button>
      <button type="button" className="button button--secondary" onClick={() => { void copy(); }}>Sao chép chẩn đoán</button>
    </div>
    <ol className={styles.events} aria-label="Log dịch vụ">
      {logs.slice(-150).map((entry) => <li key={entry.id} data-level={entry.level}>
        <time dateTime={entry.at}>{new Date(entry.at).toLocaleTimeString("vi-VN")}</time> [{serviceNames[entry.service]}] [{entry.level}] {entry.message}
      </li>)}
    </ol>
    {!logs.length && <p className="hint">Chưa có log phù hợp bộ lọc.</p>}
    <p className="hint">Giữ tối đa 500 dòng; file local-services.ndjson tối đa khoảng 2 MiB mỗi file, giữ một bản xoay vòng. Xóa hiển thị không xóa file log.</p>
  </div>;
}
