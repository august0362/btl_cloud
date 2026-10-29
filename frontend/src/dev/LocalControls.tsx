import { useCallback, useEffect, useRef, useState } from "react";
import { backendControl, backendStatus, type BackendStatus } from "../api/localBackend";
import { serviceMonitor } from "../api/serviceStatus";
import { useServiceStatus } from "../hooks/useServiceStatus";
import { statusLabel } from "../hooks/serviceActions";
import { useToast } from "../hooks/useToast";
import { ConfirmDialog } from "../components/ui";
import { ServicesPanel, processLabel, serviceNames } from "./ServicesPanel";
import styles from "./LocalControls.module.css";

const readiness = { ok: "Sẵn sàng", unavailable: "Chưa sẵn sàng", unknown: "Chưa xác định" };
const controllerUnavailable = "Controller chưa sẵn sàng. Hãy chạy run.bat.";

export default function LocalControls() {
  const service = useServiceStatus();
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [desiredOn, setDesiredOn] = useState<boolean | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [shuttingDown, setShuttingDown] = useState(false);
  const [error, setError] = useState("");
  const [developer, setDeveloper] = useState(() => {
    try { return localStorage.getItem("developer-mode") === "true"; } catch { return false; }
  });
  const mounted = useRef(false);
  const lock = useRef(false);
  const statusEpoch = useRef(0);
  const previous = useRef<BackendStatus | null>(null);
  const connected = useRef(false);
  const { show } = useToast();
  const invalidateStatus = useCallback(() => { statusEpoch.current++; }, []);
  const refresh = useCallback(async () => {
    const epoch = statusEpoch.current;
    try {
      const next = await backendStatus();
      if (mounted.current && epoch === statusEpoch.current) {
        if (next.lastError && next.lastError !== previous.current?.lastError)
          show({ tone: "danger", message: "Thao tác dịch vụ local chưa hoàn tất. Mở Services để xem lỗi và thử lại." });
        for (const item of next.services ?? []) {
          const before = previous.current?.services?.find((entry) => entry.name === item.name);
          if (item.state === "failed" && before?.state !== "failed")
            show({ tone: "danger", message: `${serviceNames[item.name]} gặp lỗi hoặc dừng ngoài dự kiến. Xem Services và dùng Start All để khôi phục.` });
          else if (item.state === "running" && before && before.state !== "running")
            show({ tone: "success", message: `${serviceNames[item.name]} đã sẵn sàng trở lại.` });
          else if (item.state === "stopped" && before?.state === "running")
            show({ tone: "info", message: `${serviceNames[item.name]} đã dừng.` });
        }
        previous.current = next;
        connected.current = true;
        setBackend(next);
        setError((value) => value === controllerUnavailable ? "" : value);
      }
    } catch {
      if (epoch !== statusEpoch.current) return;
      if (connected.current && mounted.current && !lock.current) {
        connected.current = false;
        show({ tone: "danger", message: "Không kết nối được dịch vụ local (Vite/controller). Khởi động lại bằng Start.vbs hoặc run.bat start." });
      }
      if (mounted.current && !lock.current) { setBackend(null); setError(controllerUnavailable); }
    }
  }, [show]);
  useEffect(() => {
    mounted.current = true;
    if (shuttingDown) return () => { mounted.current = false; invalidateStatus(); };
    void refresh();
    const poll = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, toolsOpen ? 2_000 : 12_000);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    return () => { mounted.current = false; invalidateStatus(); clearInterval(poll); window.removeEventListener("focus", focus); };
  }, [refresh, toolsOpen, shuttingDown, invalidateStatus]);
  const operate = async (action: "start" | "stop" | "restart" | "start-all" | "stop-all") => {
    if (lock.current) return;
    lock.current = true;
    statusEpoch.current++;
    setBusy(true);
    setDesiredOn(action !== "stop" && action !== "stop-all");
    setError("");
    serviceMonitor.beginControl(action === "start" || action === "start-all");
    let succeeded = false;
    try {
      const next = await backendControl(action);
      succeeded = true;
      if (action === "stop-all") {
        setConfirmStop(false);
        setShuttingDown(true);
        show({ tone: "info", message: "Đang dừng toàn bộ dịch vụ local. Khởi động lại bằng Start.vbs hoặc run.bat start." });
      } else if (mounted.current) {
        setBackend(next);
        show({ tone: "success", message: action === "stop" ? "Backend đã dừng. Các dịch vụ khác vẫn chạy." : action === "start-all" ? "Các dịch vụ local đã sẵn sàng." : "Backend đã sẵn sàng." });
      }
    } catch (failure) {
      if (mounted.current) {
        const message = failure instanceof Error ? failure.message : "Không điều khiển được dịch vụ.";
        setError(message); show({ tone: "danger", message });
      }
    } finally {
      lock.current = false;
      serviceMonitor.endControl((action !== "stop" && action !== "stop-all") || !succeeded);
      if (mounted.current) {
        setBusy(false); setDesiredOn(null);
        if (!(action === "stop-all" && succeeded)) void refresh();
      }
    }
  };
  const disabled = busy || !backend || backend.busy || shuttingDown;
  return <section className={`container ${styles.controls}`} aria-label="Điều khiển phát triển cục bộ">
    <div className={styles.bar}>
      <span className="muted">Cục bộ</span>
      <label className={styles.switch}>
        <input type="checkbox" role="switch" aria-label="Backend" checked={desiredOn ?? Boolean(backend && (backend.pid || ["running", "starting", "stopping"].includes(backend.state)))}
          disabled={disabled} onChange={(event) => { void operate(event.target.checked ? "start" : "stop"); }} />
        <strong>Backend</strong>
      </label>
      <span role="status">{busy ? "Đang chuyển trạng thái…" : backend ? processLabel[backend.state] : "Chưa kết nối controller"}</span>
      <label className={styles.switch}>
        <input type="checkbox" role="switch" aria-label="Developer Mode" checked={developer}
          onChange={(event) => {
            setDeveloper(event.target.checked);
            try { localStorage.setItem("developer-mode", String(event.target.checked)); } catch { /* UI remains usable. */ }
          }} />
        Chế độ phát triển
      </label>
      {!backend && <button className="button button--secondary" onClick={() => { void refresh(); }}>Kết nối controller</button>}
      <button type="button" className="button button--secondary" disabled={disabled} onClick={() => { void operate("start-all"); }}>Start All</button>
      <button type="button" className="button button--secondary" disabled={disabled} onClick={() => setConfirmStop(true)}>Stop All</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {shuttingDown && <p role="status">Đang dừng toàn bộ dịch vụ được quản lý. Dữ liệu vẫn được giữ. Dùng Start.vbs hoặc run.bat start để mở lại; lỗi dừng sẽ được lưu trong backend/tmp/local-services.ndjson.</p>}
    <details className={styles.panel} open={toolsOpen} onToggle={(event) => setToolsOpen(event.currentTarget.open)}>
      <summary>Services · Dịch vụ cục bộ</summary>
      <ServicesPanel status={backend} />
    </details>
    {developer && <details className={styles.panel} open>
      <summary>Developer Panel</summary>
      <div role="tablist" aria-label="Chẩn đoán"><button id="local-status-tab" role="tab" aria-selected="true" aria-controls="local-status-panel">Status</button></div>
      <div id="local-status-panel" role="tabpanel" aria-labelledby="local-status-tab">
        <p>Express: {backend ? processLabel[backend.state] : "Chưa xác định"} · Kết nối: {statusLabel(service.state)}</p>
        <p>MySQL: {readiness[service.database]} · SeaweedFS/S3: {readiness[service.storage]}</p>
        <div className="actions">
          <button className="button button--secondary" disabled={disabled || Boolean(backend?.pid)} onClick={() => { void operate("start"); }}>Khởi động</button>
          <button className="button button--secondary" disabled={disabled || backend?.state === "stopped"} onClick={() => { void operate("stop"); }}>Dừng</button>
          <button className="button button--secondary" disabled={disabled} onClick={() => { void operate("restart"); }}>Khởi động lại</button>
          <button className="button button--ghost" onClick={() => { void refresh(); void serviceMonitor.check(true); }}>Kiểm tra trạng thái</button>
        </div>
        {backend?.lastError && <p role="alert">{backend.lastError}</p>}
        <ol className={styles.events} aria-label="Nhật ký dịch vụ">
          {[...service.events, ...(backend?.events ?? [])].sort((a, b) => a.at.localeCompare(b.at)).slice(-60).map((event, index) =>
            <li key={`${event.at}-${index}`}><time dateTime={event.at}>{new Date(event.at).toLocaleTimeString("vi-VN")}</time> {event.message}</li>)}
        </ol>
      </div>
    </details>}
    <ConfirmDialog open={confirmStop} title="Dừng toàn bộ BTL Cloud?"
      message="Frontend, Backend, MySQL, SeaweedFS và controller do launcher quản lý sẽ dừng. Hãy giữ bản nháp cần thiết trước khi xác nhận. Tệp dữ liệu và cấu hình được giữ; mở lại bằng Start.vbs hoặc run.bat start."
      confirmLabel="Dừng tất cả" requiresBackend={false} loading={busy} error={error || undefined}
      onCancel={() => setConfirmStop(false)} onConfirm={() => { void operate("stop-all"); }} />
  </section>;
}
