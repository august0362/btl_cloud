import { describe, expect, it, vi } from "vitest";
import { authApi } from "./auth";
import { queryString, request } from "./client";
import { documentsApi } from "./documents";
import { ApiError } from "./errors";
import { errorResponse, jsonResponse, pageOf, user } from "../test/fixtures";

describe("contract API client", () => {
  it("unwraps me and sends only same-origin cookie credentials without CSRF on GET", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ user }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await authApi.me()).toEqual({ user });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      }),
    );
  });
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "adds exact CSRF header for %s",
    async (method) => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);
      await request(method, "/api/example", { body: { title: "Tên" } });
      expect(fetchMock.mock.calls[0][1]).toMatchObject({
        headers: {
          "X-CSRF-Protection": "1",
          "Content-Type": "application/json",
        },
        body: '{"title":"Tên"}',
      });
    },
  );
  it("supports a 204 logout with no body or JSON content type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(authApi.logout()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty(
      "Content-Type",
    );
  });
  it("preserves structured server errors and dispatches expiration only for UNAUTHENTICATED", async () => {
    const listener = vi.fn();
    window.addEventListener("auth:unauthorized", listener);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(errorResponse("INVALID_CREDENTIALS", 401))
      .mockResolvedValueOnce(errorResponse("UNAUTHENTICATED", 401));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      authApi.login({ email: "a@b.c", password: "wrong" }),
    ).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      details: [],
      requestId: "test-request",
    });
    expect(listener).not.toHaveBeenCalled();
    await expect(documentsApi.listMine({})).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("auth:unauthorized", listener);
  });
  it("maps network failure and aborted fetch without leaking internal messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("secret database stack")),
    );
    await expect(authApi.me()).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")),
    );
    await expect(authApi.me()).rejects.toMatchObject({
      status: 0,
      code: "ABORTED",
    });
  });
  it("does not treat malformed 2xx JSON as successful data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("<html>error</html>")),
    );
    await expect(authApi.me()).rejects.toBeInstanceOf(ApiError);
  });
  it("omits empty queries, encodes Vietnamese/percent literals and never sends visibility to public search", async () => {
    expect(queryString({ q: "", fileType: undefined, page: 2 })).toBe(
      "?page=2",
    );
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(pageOf()));
    vi.stubGlobal("fetch", fetchMock);
    await documentsApi.searchPublic({
      q: "Giải tích %",
      visibility: "PRIVATE",
      page: 1,
      pageSize: 12,
    });
    const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("q")).toBe("Giải tích %");
    expect(url.searchParams.has("visibility")).toBe(false);
    expect(documentsApi.downloadUrl("abc")).toBe("/api/documents/abc/download");
  });
  it("uses the exact mine/detail/update/remove paths and partial patch payload", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({})));
    vi.stubGlobal("fetch", fetchMock);
    await documentsApi.listMine({ visibility: "PRIVATE" });
    await documentsApi.get("id");
    await documentsApi.update("id", { description: null });
    await documentsApi.remove("id");
    expect(
      fetchMock.mock.calls.map((call) => [call[0], call[1].method]),
    ).toEqual([
      ["/api/documents/mine?visibility=PRIVATE", "GET"],
      ["/api/documents/id", "GET"],
      ["/api/documents/id", "PATCH"],
      ["/api/documents/id", "DELETE"],
    ]);
    expect(fetchMock.mock.calls[2][1].body).toBe('{"description":null}');
  });
});
