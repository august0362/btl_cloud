import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { authApi } from "./api/auth";
import { documentsApi } from "./api/documents";
import { ApiError } from "./api/errors";
import type { DocumentDto } from "./api/types";
import type { UploadOptions } from "./api/upload";
import { MAX_UPLOAD_BYTES } from "./lib/constants";
import { documentFixture as doc, pageOf, user } from "./test/fixtures";

vi.mock("./api/auth", () => ({
  authApi: { me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() },
}));
vi.mock("./api/documents", () => ({
  documentsApi: {
    searchPublic: vi.fn(),
    listMine: vi.fn(),
    get: vi.fn(),
    upload: vi.fn(),
    update: vi.fn(),
    replaceFile: vi.fn(),
    remove: vi.fn(),
    downloadUrl: (id: string) => `/api/documents/${id}/download`,
  },
}));
const api = vi.mocked(documentsApi);
const auth = vi.mocked(authApi);
function mount(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
function signedIn() {
  auth.me.mockResolvedValue({ user });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}
async function chooseFile(name = "Đề cương.pdf") {
  await userEvent.upload(
    screen.getByLabelText("Tệp tài liệu *"),
    new File(["%PDF-1.7"], name, { type: "application/pdf" }),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  auth.me.mockResolvedValue({ user: null });
  auth.login.mockResolvedValue({ user });
  auth.register.mockResolvedValue({ user });
  auth.logout.mockResolvedValue(undefined);
  api.searchPublic.mockResolvedValue(pageOf([{ ...doc, isOwner: false }]));
  api.listMine.mockResolvedValue(pageOf());
  api.get.mockResolvedValue({ ...doc });
  api.remove.mockResolvedValue(undefined);
  api.upload.mockResolvedValue({ ...doc });
  api.update.mockResolvedValue({ ...doc });
  api.replaceFile.mockResolvedValue({ ...doc, fileVersion: 2 });
});

describe("authentication, navigation and public discovery", () => {
  it("shows loading while restoring session and protects upload with redirect", async () => {
    const restoring = deferred<{ user: null }>();
    auth.me.mockReturnValue(restoring.promise);
    mount("/upload");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Đang khôi phục phiên",
    );
    await act(async () => restoring.resolve({ user: null }));
    expect(
      await screen.findByRole("heading", { name: "Đăng nhập", level: 1 }),
    ).toBeVisible();
    await userEvent.type(screen.getByLabelText("Email *"), "A@EXAMPLE.COM");
    await userEvent.type(screen.getByLabelText("Mật khẩu *"), " password ");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(
      await screen.findByRole("heading", { name: "Tải lên tài liệu" }),
    ).toBeVisible();
    expect(auth.login).toHaveBeenCalledWith({
      email: "a@example.com",
      password: " password ",
    });
  });
  it("validates registration and never sends confirmPassword to the API", async () => {
    mount("/register");
    await screen.findByRole("heading", { name: "Tạo tài khoản" });
    await userEvent.click(
      screen.getByRole("button", { name: "Tạo tài khoản" }),
    );
    expect(
      await screen.findByText("Vui lòng nhập tên hiển thị."),
    ).toBeVisible();
    expect(auth.register).not.toHaveBeenCalled();
    await userEvent.type(
      screen.getByLabelText("Tên hiển thị *"),
      " Nguyễn Văn A ",
    );
    await userEvent.type(screen.getByLabelText("Email *"), "A@EXAMPLE.COM");
    await userEvent.type(screen.getByLabelText("Mật khẩu *"), "password123");
    await userEvent.type(
      screen.getByLabelText("Nhập lại mật khẩu *"),
      "password123",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tạo tài khoản" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Tài liệu của tôi" }),
    ).toBeVisible();
    expect(auth.register).toHaveBeenCalledWith({
      displayName: "Nguyễn Văn A",
      email: "a@example.com",
      password: "password123",
    });
    expect(localStorage.length).toBe(0);
  });
  it("shows duplicate-email error beside the email field", async () => {
    auth.register.mockRejectedValue(
      new ApiError(409, "EMAIL_ALREADY_EXISTS", "Email đã được sử dụng."),
    );
    mount("/register");
    await screen.findByRole("heading", { name: "Tạo tài khoản" });
    await userEvent.type(screen.getByLabelText("Tên hiển thị *"), "A");
    await userEvent.type(screen.getByLabelText("Email *"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Mật khẩu *"), "password123");
    await userEvent.type(
      screen.getByLabelText("Nhập lại mật khẩu *"),
      "password123",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tạo tài khoản" }),
    );
    expect(await screen.findByText("Email đã được sử dụng.")).toBeVisible();
    expect(screen.getByLabelText("Email *")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });
  it("shows common invalid-credentials error, clears and focuses password", async () => {
    auth.login.mockRejectedValue(
      new ApiError(401, "INVALID_CREDENTIALS", "sensitive"),
    );
    mount("/login");
    await screen.findByRole("heading", { name: "Đăng nhập", level: 1 });
    await userEvent.type(screen.getByLabelText("Email *"), "a@example.com");
    await userEvent.type(screen.getByLabelText("Mật khẩu *"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email hoặc mật khẩu không đúng.",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Mật khẩu *")).toHaveFocus(),
    );
    expect(screen.getByLabelText("Mật khẩu *")).toHaveValue("");
  });
  it("allows guests to search, normalizes invalid page before API and offers login for download", async () => {
    mount("/?page=abc&q=Giải");
    expect(await screen.findByRole("link", { name: doc.title })).toBeVisible();
    expect(api.searchPublic).toHaveBeenCalledWith(
      expect.objectContaining({ q: "Giải", page: 1 }),
      expect.any(AbortSignal),
    );
    expect(
      screen.getByRole("link", { name: "Đăng nhập để tải xuống" }),
    ).toHaveAttribute(
      "href",
      "/login?redirect=%2F%3Fpage%3Dabc%26q%3DGi%E1%BA%A3i",
    );
    const search = screen.getByRole("search");
    await userEvent.clear(
      within(search).getByLabelText("Tìm theo tiêu đề hoặc mô tả"),
    );
    await userEvent.type(
      within(search).getByLabelText("Tìm theo tiêu đề hoặc mô tả"),
      "Đại số",
    );
    await userEvent.click(
      within(search).getByRole("button", { name: "Tìm kiếm" }),
    );
    await waitFor(() =>
      expect(api.searchPublic).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "Đại số", page: 1 }),
        expect.any(AbortSignal),
      ),
    );
  });
  it("handles public empty states, server failure and retry", async () => {
    api.searchPublic
      .mockRejectedValueOnce(new ApiError(500, "INTERNAL_ERROR", "stack"))
      .mockResolvedValue(pageOf([]));
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể tải danh sách tài liệu.",
    );
    expect(screen.queryByText("stack")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(
      await screen.findByText("Chưa có tài liệu công khai nào."),
    ).toBeVisible();
  });
  it("shows filtered empty state and clears search filters", async () => {
    api.searchPublic.mockResolvedValue(pageOf([]));
    mount("/?q=unknown");
    expect(
      await screen.findByText("Không tìm thấy tài liệu phù hợp với “unknown”."),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Xoá bộ lọc" }));
    expect(
      await screen.findByText("Chưa có tài liệu công khai nào."),
    ).toBeVisible();
  });
  it("paginates and filters the personal collection using the documented API", async () => {
    signedIn();
    api.listMine.mockResolvedValue(pageOf([doc], 25));
    mount("/me/documents");
    await screen.findByRole("heading", { name: "Tài liệu của tôi" });
    await screen.findByRole("button", { name: "Sau »" });
    await userEvent.click(screen.getByRole("button", { name: "Sau »" }));
    await waitFor(() =>
      expect(api.listMine).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.any(AbortSignal),
      ),
    );
    await userEvent.selectOptions(screen.getByLabelText("Chế độ"), "PRIVATE");
    await waitFor(() =>
      expect(api.listMine).toHaveBeenLastCalledWith(
        expect.objectContaining({ visibility: "PRIVATE", page: 1 }),
        expect.any(AbortSignal),
      ),
    );
  });
  it("handles session expiration on a protected page", async () => {
    signedIn();
    mount("/me/documents");
    await screen.findByRole("heading", { name: "Tài liệu của tôi" });
    act(() => window.dispatchEvent(new Event("auth:unauthorized")));
    expect(
      await screen.findByRole("heading", { name: "Đăng nhập", level: 1 }),
    ).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Phiên đăng nhập đã hết hạn",
    );
  });
  it("blocks an external redirect, sends logged-in guests-only routes to their collection, and supports logout", async () => {
    signedIn();
    mount("/login?redirect=//evil.example");
    await screen.findByRole("heading", { name: "Tài liệu của tôi" });
    await userEvent.click(screen.getByRole("button", { name: "Đăng xuất" }));
    expect(
      await screen.findByRole("heading", { name: "Khám phá tài liệu học tập" }),
    ).toBeVisible();
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });
  it("renders the unknown route without requesting documents", async () => {
    mount("/khong-ton-tai");
    expect(
      screen.getByRole("heading", { name: "Không tìm thấy trang" }),
    ).toBeVisible();
    await waitFor(() => expect(auth.me).toHaveBeenCalled());
    expect(api.get).not.toHaveBeenCalled();
    expect(api.searchPublic).not.toHaveBeenCalled();
  });
});

describe("upload and document management", () => {
  it("requires explicit visibility and validates empty, unsupported and oversize files", async () => {
    signedIn();
    mount("/upload");
    await screen.findByRole("heading", { name: "Tải lên tài liệu" });
    expect(
      screen
        .getAllByRole("radio")
        .every((radio) => !(radio as HTMLInputElement).checked),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Tải lên" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Tệp tài liệu *"), {
      target: { files: [new File([], "empty.pdf")] },
    });
    expect(screen.getByText("Tệp rỗng, vui lòng chọn tệp khác.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Tệp tài liệu *"), {
      target: { files: [new File(["x"], "invalid.exe")] },
    });
    expect(screen.getByText("Chỉ hỗ trợ tệp PDF, DOCX, PPTX.")).toBeVisible();
    const large = new File(["x"], "large.pdf");
    Object.defineProperty(large, "size", { value: MAX_UPLOAD_BYTES + 1 });
    fireEvent.change(screen.getByLabelText("Tệp tài liệu *"), {
      target: { files: [large] },
    });
    expect(
      screen.getByText("Tệp vượt quá dung lượng tối đa 50 MB."),
    ).toBeVisible();
    expect(api.upload).not.toHaveBeenCalled();
  });
  it("auto-fills title, disables duplicate submissions, waits for server success then lists the document", async () => {
    signedIn();
    const pending = deferred<DocumentDto>();
    api.upload.mockReturnValue(pending.promise);
    mount("/upload");
    await screen.findByRole("heading", { name: "Tải lên tài liệu" });
    await chooseFile();
    expect(screen.getByLabelText("Tiêu đề *")).toHaveValue("Đề cương");
    await userEvent.click(screen.getByRole("radio", { name: /^Riêng tư/ }));
    await userEvent.dblClick(screen.getByRole("button", { name: "Tải lên" }));
    expect(api.upload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Tải lên thành công")).not.toBeInTheDocument();
    await act(async () => pending.resolve(doc));
    expect(
      await screen.findByRole("heading", { name: "Tài liệu của tôi" }),
    ).toBeVisible();
    expect(api.upload).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Đề cương", visibility: "PRIVATE" }),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        onProgress: expect.any(Function),
      }),
    );
  });
  it("keeps selected file/form on storage failure and never shows success", async () => {
    signedIn();
    api.upload.mockRejectedValue(
      new ApiError(503, "STORAGE_UNAVAILABLE", "Unavailable"),
    );
    mount("/upload");
    await screen.findByRole("heading", { name: "Tải lên tài liệu" });
    await chooseFile();
    await userEvent.click(screen.getByRole("radio", { name: /^Công khai/ }));
    await userEvent.click(screen.getByRole("button", { name: "Tải lên" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Kho lưu trữ tệp tạm thời không khả dụng.",
    );
    expect(screen.getByText("Đề cương.pdf")).toBeVisible();
    expect(screen.queryByText("Tải lên thành công")).not.toBeInTheDocument();
  });
  it("cancels an active upload through the actual AbortSignal boundary", async () => {
    signedIn();
    api.upload.mockImplementation(
      (_input, options = {}) =>
        new Promise((_resolve, reject) =>
          options.signal?.addEventListener("abort", () =>
            reject(new ApiError(0, "ABORTED", "Đã huỷ tải lên.")),
          ),
        ),
    );
    mount("/upload");
    await screen.findByRole("heading", { name: "Tải lên tài liệu" });
    await chooseFile();
    await userEvent.click(screen.getByRole("radio", { name: /^Riêng tư/ }));
    await userEvent.click(screen.getByRole("button", { name: "Tải lên" }));
    await userEvent.click(screen.getByRole("button", { name: "Huỷ tải lên" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Đã huỷ tải lên.",
    );
    expect(screen.queryByText("Tải lên thành công")).not.toBeInTheDocument();
  });
  it("only sends changed metadata and requires confirmation before Private → Public", async () => {
    signedIn();
    api.get.mockResolvedValue({ ...doc, visibility: "PRIVATE" });
    api.update.mockResolvedValue({
      ...doc,
      visibility: "PRIVATE",
      title: "Tiêu đề mới",
    });
    mount(`/documents/${doc.id}/edit`);
    await screen.findByRole("heading", { name: "Chỉnh sửa tài liệu" });
    await screen.findByLabelText("Tiêu đề *");
    expect(screen.getByRole("button", { name: "Lưu thay đổi" })).toBeDisabled();
    await userEvent.clear(screen.getByLabelText("Tiêu đề *"));
    await userEvent.type(screen.getByLabelText("Tiêu đề *"), "Tiêu đề mới");
    await userEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith(doc.id, { title: "Tiêu đề mới" }),
    );
    await userEvent.click(screen.getByRole("radio", { name: /^Công khai/ }));
    await userEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Chuyển sang Công khai?",
    });
    expect(api.update).toHaveBeenCalledTimes(1);
    await userEvent.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    expect(api.update).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await userEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Chuyển sang Công khai?" }),
      ).getByRole("button", { name: "Chuyển sang Công khai" }),
    );
    await waitFor(() =>
      expect(api.update).toHaveBeenLastCalledWith(doc.id, {
        visibility: "PUBLIC",
      }),
    );
  });
  it("failed replacement retains the existing version and does not claim success", async () => {
    signedIn();
    api.replaceFile.mockRejectedValue(
      new ApiError(503, "STORAGE_UNAVAILABLE", "Unavailable"),
    );
    mount(`/documents/${doc.id}/edit`);
    await screen.findByLabelText("Tiêu đề *");
    await chooseFile("new.pdf");
    await userEvent.click(screen.getByRole("button", { name: "Thay thế tệp" }));
    const dialog = await screen.findByRole("dialog", { name: "Thay thế tệp?" });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Thay thế" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Tệp hiện tại vẫn được giữ nguyên.",
    );
    expect(screen.getByText(/Phiên bản 1/)).toBeVisible();
    expect(screen.queryByText("Đã thay thế tệp")).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Công khai/ })).toBeChecked();
  });
  it("successful replacement sends only a file and uses the server-confirmed version", async () => {
    signedIn();
    mount(`/documents/${doc.id}/edit`);
    await screen.findByLabelText("Tiêu đề *");
    await chooseFile("new.pdf");
    await userEvent.click(screen.getByRole("button", { name: "Thay thế tệp" }));
    await userEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Thay thế tệp?" }),
      ).getByRole("button", { name: "Thay thế" }),
    );
    expect(await screen.findByText(/Phiên bản 2/)).toBeVisible();
    expect(api.replaceFile).toHaveBeenCalledWith(
      doc.id,
      expect.any(File),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.getByRole("radio", { name: /^Công khai/ })).toBeChecked();
  });
  it("requires delete confirmation, focuses cancel, and keeps document on API failure", async () => {
    signedIn();
    api.remove.mockRejectedValue(
      new ApiError(500, "INTERNAL_ERROR", "hidden stack"),
    );
    mount(`/documents/${doc.id}`);
    await screen.findByRole("heading", { name: doc.title });
    await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
    let dialog = await screen.findByRole("dialog", {
      name: "Xoá vĩnh viễn tài liệu?",
    });
    expect(within(dialog).getByRole("button", { name: "Huỷ" })).toHaveFocus();
    await userEvent.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    expect(api.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
    dialog = await screen.findByRole("dialog", {
      name: "Xoá vĩnh viễn tài liệu?",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Xoá vĩnh viễn" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Đã có lỗi xảy ra.",
    );
    expect(screen.getByRole("heading", { name: doc.title })).toBeVisible();
    expect(screen.queryByText("Đã xoá tài liệu")).not.toBeInTheDocument();
  });
  it("reloads the previous collection page after deleting its final row", async () => {
    signedIn();
    api.listMine.mockResolvedValue(pageOf([doc], 13));
    mount("/me/documents?page=2");
    await screen.findAllByRole("button", { name: `Xoá ${doc.title}` });
    await userEvent.click(
      screen.getAllByRole("button", { name: `Xoá ${doc.title}` })[0],
    );
    await userEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Xoá vĩnh viễn tài liệu?" }),
      ).getByRole("button", { name: "Xoá vĩnh viễn" }),
    );
    await waitFor(() =>
      expect(api.listMine).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1 }),
        expect.any(AbortSignal),
      ),
    );
  });
  it("shows 404 and prevents non-owner management", async () => {
    signedIn();
    api.get.mockResolvedValue({ ...doc, isOwner: false });
    mount(`/documents/${doc.id}/edit`);
    expect(
      await screen.findByText("Bạn không có quyền chỉnh sửa tài liệu này."),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Lưu thay đổi" }),
    ).not.toBeInTheDocument();
  });
  it("offers reload after a conflicting replacement without changing the version", async () => {
    signedIn();
    api.replaceFile.mockRejectedValue(new ApiError(409, "CONFLICT", "Changed"));
    mount(`/documents/${doc.id}/edit`);
    await screen.findByLabelText("Tiêu đề *");
    await chooseFile("new.pdf");
    await userEvent.click(screen.getByRole("button", { name: "Thay thế tệp" }));
    await userEvent.click(
      within(
        await screen.findByRole("dialog", { name: "Thay thế tệp?" }),
      ).getByRole("button", { name: "Thay thế" }),
    );
    expect(
      await screen.findByRole("button", { name: "Tải lại" }),
    ).toBeVisible();
    expect(screen.getByText(/Phiên bản 1/)).toBeVisible();
    const previousCalls = api.get.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    await waitFor(() =>
      expect(api.get.mock.calls.length).toBeGreaterThan(previousCalls),
    );
  });
  it("offers reload inside the delete dialog after a conflict", async () => {
    signedIn();
    api.remove.mockRejectedValue(new ApiError(409, "CONFLICT", "Changed"));
    mount(`/documents/${doc.id}`);
    await screen.findByRole("heading", { name: doc.title });
    await userEvent.click(screen.getByRole("button", { name: "Xoá" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Xoá vĩnh viễn tài liệu?",
    });
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Xoá vĩnh viễn" }),
    );
    expect(
      await within(dialog).findByRole("button", { name: "Tải lại" }),
    ).toBeVisible();
    const previousCalls = api.get.mock.calls.length;
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Tải lại" }),
    );
    await waitFor(() =>
      expect(api.get.mock.calls.length).toBeGreaterThan(previousCalls),
    );
    expect(screen.queryByText("Đã xoá tài liệu")).not.toBeInTheDocument();
  });
  it("shows a private/not-found document as unavailable", async () => {
    api.get.mockRejectedValue(
      new ApiError(404, "DOCUMENT_NOT_FOUND", "Not found"),
    );
    mount(`/documents/${doc.id}`);
    expect(
      await screen.findByRole("heading", { name: "Không tìm thấy tài liệu" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Tải xuống" }),
    ).not.toBeInTheDocument();
  });
  it("prechecks the session before download and directs an expired session to login", async () => {
    signedIn();
    mount(`/documents/${doc.id}`);
    await screen.findByRole("heading", { name: doc.title });
    auth.me.mockResolvedValue({ user: null });
    await userEvent.click(screen.getByRole("button", { name: "Tải xuống" }));
    expect(
      await screen.findByRole("heading", { name: "Đăng nhập", level: 1 }),
    ).toBeVisible();
  });
  it("shows progress without declaring completion at 100 percent", async () => {
    signedIn();
    const pending = deferred<DocumentDto>();
    api.upload.mockImplementation((_input, options: UploadOptions = {}) => {
      queueMicrotask(() => options.onProgress?.(100));
      return pending.promise;
    });
    mount("/upload");
    await screen.findByRole("heading", { name: "Tải lên tài liệu" });
    await chooseFile();
    await userEvent.click(screen.getByRole("radio", { name: /^Công khai/ }));
    await userEvent.click(screen.getByRole("button", { name: "Tải lên" }));
    expect(await screen.findByText("Đang chờ máy chủ xác nhận…")).toBeVisible();
    expect(screen.queryByText("Tải lên thành công")).not.toBeInTheDocument();
    await act(async () => pending.resolve(doc));
  });
});
