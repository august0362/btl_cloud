import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthState } from "../auth/context";
import { LoginPage, RegisterPage } from "./AuthPages";

vi.mock("../hooks/useServiceStatus", () => ({ useServiceStatus: () => ({ unavailable: false }) }));

function mount(registration = true) {
  const auth: AuthState = {
    user: null, status: "ready", login: vi.fn(), register: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(), refresh: vi.fn(), markSignedOut: vi.fn(),
  };
  render(<MemoryRouter><AuthContext.Provider value={auth}>
    {registration ? <RegisterPage /> : <LoginPage />}
  </AuthContext.Provider></MemoryRouter>);
  return auth;
}

describe("E6-AC-02: form đăng ký", () => {
  it("gõ không gọi mạng; mật khẩu Yếu vẫn gửi đăng ký", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    vi.stubGlobal("XMLHttpRequest", network);
    const auth = mount();
    await userEvent.type(screen.getByLabelText("Tên hiển thị *"), "Nguyễn A");
    await userEvent.type(screen.getByLabelText("Email *"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Mật khẩu *"), "abcdefgh");
    await userEvent.type(screen.getByLabelText("Nhập lại mật khẩu *"), "abcdefgh");
    expect(screen.getByRole("status")).toHaveTextContent("Độ mạnh mật khẩu: Yếu");
    expect(network).not.toHaveBeenCalled();
    expect(auth.register).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Tạo tài khoản" }));
    await waitFor(() => expect(auth.register).toHaveBeenCalledWith({
      displayName: "Nguyễn A", email: "a@example.com", password: "abcdefgh",
    }));
  });

  it("form đăng nhập không có chỉ báo", () => {
    mount(false);
    expect(screen.queryByText(/Độ mạnh mật khẩu/)).not.toBeInTheDocument();
  });
});
