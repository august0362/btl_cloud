import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentsApi } from "./documents";
import { uploadMultipart } from "./upload";
import { documentFixture } from "../test/fixtures";

class FakeXHR {
  static last: FakeXHR;
  status = 200;
  responseText = JSON.stringify({ data: documentFixture });
  withCredentials = false;
  headers: Record<string, string> = {};
  upload = {
    onprogress: null as
      | ((event: {
          lengthComputable: boolean;
          loaded: number;
          total: number;
        }) => void)
      | null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  method = "";
  path = "";
  body?: FormData;
  constructor() {
    FakeXHR.last = this;
  }
  open(method: string, path: string) {
    this.method = method;
    this.path = path;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  getResponseHeader() {
    return "upload-request";
  }
  send(body: FormData) {
    this.body = body;
  }
  abort() {
    this.onabort?.();
  }
}
describe("multipart contract", () => {
  beforeEach(() => vi.stubGlobal("XMLHttpRequest", FakeXHR));
  it("sends text before file and leaves boundary selection to the browser", async () => {
    const file = new File(["%PDF-1.7"], "Đề cương.pdf");
    const result = documentsApi.upload({
      title: "Tên",
      description: " Mô tả ",
      visibility: "PRIVATE",
      file,
    });
    expect([...FakeXHR.last.body!.keys()]).toEqual([
      "title",
      "description",
      "visibility",
      "file",
    ]);
    expect(FakeXHR.last.headers).toEqual({
      Accept: "application/json",
      "X-CSRF-Protection": "1",
    });
    FakeXHR.last.onload?.();
    await expect(result).resolves.toEqual(documentFixture);
  });
  it("replaces using only file, never resubmitting visibility or metadata", async () => {
    const result = documentsApi.replaceFile(
      "id",
      new File(["%PDF-1.7"], "new.pdf"),
    );
    expect(FakeXHR.last.method).toBe("PUT");
    expect(FakeXHR.last.path).toBe("/api/documents/id/file");
    expect([...FakeXHR.last.body!.keys()]).toEqual(["file"]);
    FakeXHR.last.onload?.();
    await result;
  });
  it("reports progress and propagates AbortSignal cancellation", async () => {
    const controller = new AbortController();
    const progress = vi.fn();
    const result = uploadMultipart("POST", "/api/documents", new FormData(), {
      signal: controller.signal,
      onProgress: progress,
    });
    FakeXHR.last.upload.onprogress?.({
      lengthComputable: true,
      loaded: 45,
      total: 100,
    });
    expect(progress).toHaveBeenCalledWith(45);
    controller.abort();
    await expect(result).rejects.toMatchObject({ code: "ABORTED" });
  });
  it.each([
    [413, "FILE_TOO_LARGE"],
    [415, "UNSUPPORTED_FILE_TYPE"],
    [503, "STORAGE_UNAVAILABLE"],
    [409, "CONFLICT"],
  ])("rejects %i %s without success", async (status, code) => {
    const result = uploadMultipart(
      "PUT",
      "/api/documents/id/file",
      new FormData(),
    );
    FakeXHR.last.status = status;
    FakeXHR.last.responseText = JSON.stringify({
      error: { code, message: "Lỗi", details: [], requestId: "request" },
    });
    FakeXHR.last.onload?.();
    await expect(result).rejects.toMatchObject({
      status,
      code,
      requestId: "request",
    });
  });
  it("handles early cancellation, network errors and malformed success", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadMultipart("POST", "/api/documents", new FormData(), {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    const failed = uploadMultipart("POST", "/api/documents", new FormData());
    FakeXHR.last.onerror?.();
    await expect(failed).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    const malformed = uploadMultipart("POST", "/api/documents", new FormData());
    FakeXHR.last.responseText = "invalid";
    FakeXHR.last.onload?.();
    await expect(malformed).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
