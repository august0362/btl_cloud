import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { BackendStatus } from "../api/localBackend";
import { ToastProvider } from "../components/ToastProvider";
import { ServicesPanel } from "./ServicesPanel";

const status: BackendStatus = {
  state: "running", pid: 10, busy: false, lastError: null, events: [], mode: "portable",
  services: [{ name: "backend", port: 3000, pid: 10, managed: true, state: "running", lastError: null }],
  logs: [
    { id: 1, at: "2026-10-29T01:00:00Z", service: "backend", level: "INFO", kind: "output", message: "Backend sẵn sàng" },
    { id: 2, at: "2026-10-29T01:00:01Z", service: "mysql", level: "ERROR", kind: "output", message: "MySQL chưa sẵn sàng" },
  ],
};
it("filters and clears displayed logs without modifying the controller buffer; copies selected diagnostics", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const user = userEvent.setup();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<ToastProvider><ServicesPanel status={status} /></ToastProvider>);
  await user.selectOptions(screen.getByRole("combobox", { name: "Lọc dịch vụ" }), "mysql");
  await user.selectOptions(screen.getByRole("combobox", { name: "Lọc mức log" }), "ERROR");
  expect(screen.getByLabelText("Log dịch vụ")).toHaveTextContent("MySQL chưa sẵn sàng");
  expect(screen.getByLabelText("Log dịch vụ")).not.toHaveTextContent("Backend sẵn sàng");
  await user.click(screen.getByRole("button", { name: "Sao chép chẩn đoán" }));
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
  expect(JSON.parse(writeText.mock.calls[0][0]).logs).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Xóa log hiển thị" }));
  expect(screen.getByLabelText("Log dịch vụ")).toBeEmptyDOMElement();
  expect(status.logs).toHaveLength(2);
});
