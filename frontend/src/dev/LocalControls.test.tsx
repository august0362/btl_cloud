import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { serviceMonitor } from "../api/serviceStatus";
import { backendControl, backendStatus, type BackendStatus } from "../api/localBackend";
import { ServiceIndicator } from "../components/ServiceStatus";
import { Button, TextField } from "../components/ui";
import { ToastProvider } from "../components/ToastProvider";
import LocalControls from "./LocalControls";

vi.mock("../api/localBackend", () => ({ backendControl: vi.fn(), backendStatus: vi.fn() }));
let running: boolean;
const status = (): BackendStatus => ({ state: running ? "running" : "stopped", pid: running ? 123 : null, busy: false, lastError: null, events: [] });
beforeEach(() => {
  running = true;
  localStorage.clear();
  vi.mocked(backendStatus).mockImplementation(async () => status());
  vi.mocked(backendControl).mockImplementation(async (action) => { running = action !== "stop"; return status(); });
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (!running) throw new TypeError("network");
    return new Response(JSON.stringify({ data: path.endsWith("/ready") ? { checks: { database: "ok", storage: "ok" } } : { status: "ok" } }));
  }));
});

it("Stop All requires confirmation, works while Backend is OFF, and Start All is independent of Developer Mode", async () => {
  running = false;
  render(<ToastProvider><LocalControls /></ToastProvider>);
  const backend = screen.getByRole("switch", { name: "Backend" });
  await waitFor(() => expect(backend).toBeEnabled());
  expect(backend).not.toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Start All" }));
  await waitFor(() => expect(backendControl).toHaveBeenCalledWith("start-all"));
  await waitFor(() => expect(backend).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Stop All" }));
  const dialog = await screen.findByRole("dialog", { name: "Dừng toàn bộ BTL Cloud?" });
  expect(backendControl).not.toHaveBeenCalledWith("stop-all");
  await userEvent.click(screen.getByRole("button", { name: "Huỷ" }));
  expect(dialog).not.toHaveAttribute("open");
  await userEvent.click(backend);
  await waitFor(() => expect(backend).toBeEnabled());
  await userEvent.click(screen.getByRole("button", { name: "Stop All" }));
  await userEvent.click(screen.getByRole("button", { name: "Dừng tất cả" }));
  await waitFor(() => expect(backendControl).toHaveBeenCalledWith("stop-all"));
  expect(screen.getByRole("switch", { name: "Developer Mode" })).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Start All" })).toBeDisabled();
});

it("shows Vietnamese failure and recovery toasts for live service transitions", async () => {
  const snapshot = (state: "running" | "failed"): BackendStatus => ({ ...status(), services: [{ name: "backend", port: 3000, state, pid: state === "running" ? 123 : null, managed: state === "running", lastError: null }] });
  vi.mocked(backendStatus).mockResolvedValue(snapshot("running"));
  render(<ToastProvider><LocalControls /></ToastProvider>);
  await waitFor(() => expect(screen.getByRole("switch", { name: "Backend" })).toBeEnabled());
  vi.mocked(backendStatus).mockResolvedValue(snapshot("failed"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(await screen.findByText(/Backend gặp lỗi hoặc dừng ngoài dự kiến/)).toBeVisible();
  vi.mocked(backendStatus).mockResolvedValue(snapshot("running"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(await screen.findByText("Backend đã sẵn sàng trở lại.")).toBeVisible();
});

it("a slow status read from before Stop cannot turn the Backend switch back ON", async () => {
  render(<LocalControls />);
  const backend = screen.getByRole("switch", { name: "Backend" });
  await waitFor(() => expect(backend).toBeEnabled());
  let resolve!: (value: BackendStatus) => void;
  vi.mocked(backendStatus).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  act(() => { window.dispatchEvent(new Event("focus")); });
  await userEvent.click(backend);
  await waitFor(() => expect(backend).not.toBeChecked());
  await waitFor(() => expect(backend).toBeEnabled());
  await act(async () => resolve({ state: "running", pid: 123, busy: false, lastError: null, events: [] }));
  expect(backend).not.toBeChecked();
});

it("keeps service logs live while a Start All operation is still pending", async () => {
  let resolve!: (value: BackendStatus) => void;
  vi.mocked(backendControl).mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<LocalControls />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Start All" })).toBeEnabled());
  await userEvent.click(screen.getByText("Services · Dịch vụ cục bộ", { exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Start All" }));
  vi.mocked(backendStatus).mockResolvedValue({ ...status(), busy: true, logs: [{ id: 1, at: "2026-10-29T01:00:00Z", service: "controller", level: "INFO", kind: "output", message: "Đang chuẩn bị dịch vụ" }] });
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(await screen.findByLabelText("Log dịch vụ")).toHaveTextContent("Đang chuẩn bị dịch vụ");
  vi.mocked(backendStatus).mockResolvedValue(status());
  await act(async () => resolve(status()));
  await waitFor(() => expect(screen.getByRole("button", { name: "Start All" })).toBeEnabled());
});
afterEach(() => { localStorage.clear(); });

it("Backend switch works with Developer Mode OFF, retains drafts, and restores actions without submitting", async () => {
  const submit = vi.fn();
  render(<><ServiceIndicator /><LocalControls /><TextField label="Bản nháp" defaultValue="Nội dung chưa gửi" /><Button requiresBackend onClick={submit}>Gửi tài liệu</Button></>);
  const backend = screen.getByRole("switch", { name: "Backend" });
  const developer = screen.getByRole("switch", { name: "Developer Mode" });
  await waitFor(() => expect(backend).toBeEnabled());
  expect(developer).not.toBeChecked();
  expect(screen.queryByRole("tab", { name: "Status" })).not.toBeInTheDocument();
  await userEvent.click(backend);
  await waitFor(() => expect(serviceMonitor.getSnapshot().state).toBe("offline"));
  expect(screen.getByRole("button", { name: "Gửi tài liệu" })).toBeDisabled();
  expect(screen.getByLabelText("Bản nháp")).toHaveValue("Nội dung chưa gửi");
  expect(submit).not.toHaveBeenCalled();
  await userEvent.click(backend);
  await waitFor(() => expect(serviceMonitor.getSnapshot().state).toBe("online"));
  expect(screen.getByRole("button", { name: "Gửi tài liệu" })).toBeEnabled();
  expect(submit).not.toHaveBeenCalled();
  expect(backendControl).toHaveBeenNthCalledWith(1, "stop");
  expect(backendControl).toHaveBeenNthCalledWith(2, "start");
  expect(developer).not.toBeChecked();
  await userEvent.click(developer);
  expect(await screen.findByRole("tab", { name: "Status" })).toBeVisible();
  expect(screen.getByText(/MySQL: Sẵn sàng/)).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Khởi động lại" }));
  await waitFor(() => expect(backendControl).toHaveBeenLastCalledWith("restart"));
  await waitFor(() => expect(serviceMonitor.getSnapshot().state).toBe("online"));
  await userEvent.click(developer);
  expect(screen.queryByRole("tab", { name: "Status" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Kết nối: Trực tuyến")).toBeVisible();
  expect(backend).toBeChecked();
});

it("locks duplicate control clicks and reports failures without unhandled rejection", async () => {
  let reject!: (error: Error) => void;
  vi.mocked(backendControl).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  render(<LocalControls />);
  const backend = await screen.findByRole("switch", { name: "Backend" });
  await waitFor(() => expect(backend).toBeEnabled());
  await userEvent.dblClick(backend);
  expect(backendControl).toHaveBeenCalledTimes(1);
  expect(backend).toBeDisabled();
  await act(async () => reject(new Error("Không thể điều khiển.")));
  expect(await screen.findByRole("alert")).toHaveTextContent("Không thể điều khiển.");
});
