import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { developerSession, developerSessionExpired } from "../api/localBackend";
import DeveloperAccess from "./DeveloperAccess";

vi.mock("../api/localBackend", () => ({ developerSession: vi.fn(), developerSessionExpired: "developer:unauthorized" }));
vi.mock("./LocalControls", () => ({ default: () => <div>Protected local controls</div> }));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(developerSession).mockResolvedValue({ user: null, configured: true });
});

it("ignores a forged localStorage flag, rejects wrong credentials, then opens tools only after login", async () => {
  localStorage.setItem("developer-mode", "true");
  render(<DeveloperAccess />);
  await userEvent.click(await screen.findByText("Đăng nhập nhà phát triển"));
  expect(screen.queryByText("Protected local controls")).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Tài khoản nhà phát triển *"), "developer");
  await userEvent.type(screen.getByLabelText("Mật khẩu nhà phát triển *"), "wrong");
  vi.mocked(developerSession).mockRejectedValueOnce(new Error("Tài khoản hoặc mật khẩu không đúng."));
  await userEvent.click(screen.getByRole("button", { name: "Mở công cụ phát triển" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Tài khoản hoặc mật khẩu không đúng.");
  expect(screen.getByLabelText("Mật khẩu nhà phát triển *")).toHaveValue("");
  expect(screen.queryByText("Protected local controls")).not.toBeInTheDocument();
  vi.mocked(developerSession).mockResolvedValueOnce({ user: { username: "developer" } });
  await userEvent.type(screen.getByLabelText("Mật khẩu nhà phát triển *"), "issued-password");
  await userEvent.click(screen.getByRole("button", { name: "Mở công cụ phát triển" }));
  expect(await screen.findByText("Protected local controls")).toBeVisible();
  expect(developerSession).toHaveBeenLastCalledWith("login", { username: "developer", password: "issued-password" });
  vi.mocked(developerSession).mockResolvedValueOnce({ user: null });
  await userEvent.click(screen.getByRole("button", { name: "Đăng xuất nhà phát triển" }));
  await waitFor(() => expect(screen.queryByText("Protected local controls")).not.toBeInTheDocument());
  expect(localStorage.getItem("developer-mode")).toBeNull();
});

it("restores a server session and closes every tool when it expires", async () => {
  vi.mocked(developerSession).mockResolvedValueOnce({ user: { username: "developer" } });
  render(<DeveloperAccess />);
  expect(await screen.findByText("Protected local controls")).toBeVisible();
  act(() => window.dispatchEvent(new Event(developerSessionExpired)));
  expect(screen.queryByText("Protected local controls")).not.toBeInTheDocument();
  await userEvent.click(screen.getByText("Đăng nhập nhà phát triển"));
  expect(screen.getByRole("alert")).toHaveTextContent("Phiên nhà phát triển đã hết hạn.");
});
