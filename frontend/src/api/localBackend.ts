export type ProcessState = "stopped" | "starting" | "running" | "stopping" | "failed";
export type LocalServiceName = "frontend" | "backend" | "mysql" | "seaweedfs";
export interface LocalService {
  name: LocalServiceName;
  state: ProcessState;
  port: number;
  pid: number | null;
  nativePid?: number | null;
  containerId?: string | null;
  managed: boolean;
  lastError: string | null;
}
export interface ServiceLog {
  id: number; at: string; service: LocalServiceName | "controller";
  level: "INFO" | "WARN" | "ERROR"; kind: string; message: string;
}
export interface BackendStatus {
  state: ProcessState;
  pid: number | null;
  busy: boolean;
  lastError: string | null;
  events: { at: string; state: string; message: string }[];
  services?: LocalService[];
  logs?: ServiceLog[];
  operation?: string | null;
  logError?: string | null;
  mode?: string;
}
let pendingStatus: Promise<BackendStatus> | undefined;
export const developerSessionExpired = "developer:unauthorized";
export interface DeveloperSession { user: { username: string } | null; configured?: boolean }
export async function developerSession(action: "session" | "login" | "logout" = "session", input?: { username: string; password: string }): Promise<DeveloperSession> {
  const response = await fetch(`/__local/backend/${action}`, {
    method: action === "session" ? "GET" : "POST", cache: "no-store", credentials: "same-origin",
    headers: { "X-Local-Control": "1", "Content-Type": "application/json" },
    body: input ? JSON.stringify(input) : undefined, signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "Không kết nối được controller cục bộ.");
  pendingStatus = undefined;
  return payload;
}
export async function backendControl(action: "status" | "start" | "stop" | "restart" | "start-all" | "stop-all"): Promise<BackendStatus> {
  if (action !== "status") pendingStatus = undefined;
  const response = await fetch(`/__local/backend/${action}`, {
    method: action === "status" ? "GET" : "POST", cache: "no-store", credentials: "same-origin",
    headers: { "X-Local-Control": "1" }, signal: AbortSignal.timeout(action === "start-all" ? 900_000 : 60_000),
  });
  const payload = await response.json();
  if (response.status === 401) window.dispatchEvent(new Event(developerSessionExpired));
  if (!response.ok) throw new Error(payload.error ?? "Không kết nối được controller cục bộ.");
  return payload;
}
export function backendStatus() {
  if (!pendingStatus) {
    const current = backendControl("status").finally(() => { if (pendingStatus === current) pendingStatus = undefined; });
    pendingStatus = current;
  }
  return pendingStatus;
}
