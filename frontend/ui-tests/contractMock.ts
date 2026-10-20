import type { Page } from "@playwright/test";
import type { DocumentDto } from "../src/api/types";
import { documentFixture, pageOf, user } from "../src/test/fixtures";

export async function installContractMock(page: Page, signedIn = false) {
  const state = {
    signedIn,
    documents: [{ ...documentFixture }],
    failUpload: false,
    failReplace: false,
  };
  await page.route("**/*", async (route) => {
    if (
      route.request().isNavigationRequest() &&
      route.request().resourceType() === "document"
    ) {
      const response = await route.fetch();
      await route.fulfill({
        response,
        headers: {
          ...response.headers(),
          "Content-Security-Policy":
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
        },
      });
    } else await route.fallback();
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const ok = (data: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({ data }),
      });
    const fail = (code: string, status: number) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code,
            message: "Lỗi thử nghiệm.",
            details: [],
            requestId: "ui-test-request",
          },
        }),
      });
    if (url.pathname === "/api/auth/me")
      return ok({ user: state.signedIn ? user : null });
    if (
      url.pathname === "/api/auth/login" ||
      url.pathname === "/api/auth/register"
    ) {
      state.signedIn = true;
      return ok({ user }, url.pathname.endsWith("register") ? 201 : 200);
    }
    if (url.pathname === "/api/auth/logout") {
      state.signedIn = false;
      return route.fulfill({ status: 204 });
    }
    if (method !== "GET" && request.headers()["x-csrf-protection"] !== "1")
      return fail("CSRF_REJECTED", 403);
    if (url.pathname === "/api/documents" && method === "POST") {
      if (state.failUpload) return fail("STORAGE_UNAVAILABLE", 503);
      const body = request.postData() ?? "";
      const field = (name: string) =>
        new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`).exec(body)?.[1];
      const document: DocumentDto = {
        ...documentFixture,
        id: "7b3ac676-a453-446d-bd60-225d7562ec04",
        title: field("title") ?? "Tài liệu mới",
        visibility: field("visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      };
      state.documents.push(document);
      return ok(document, 201);
    }
    if (
      url.pathname === "/api/documents" ||
      url.pathname === "/api/documents/mine"
    ) {
      let items = state.documents.filter(
        (item) => url.pathname.endsWith("mine") || item.visibility === "PUBLIC",
      );
      const q = url.searchParams.get("q");
      const visibility = url.searchParams.get("visibility");
      if (q) items = items.filter((item) => item.title.includes(q));
      if (visibility)
        items = items.filter((item) => item.visibility === visibility);
      return ok(
        pageOf(items.map((item) => ({ ...item, isOwner: state.signedIn }))),
      );
    }
    const id = url.pathname.split("/")[3];
    const document = state.documents.find((item) => item.id === id);
    if (!document || (document.visibility === "PRIVATE" && !state.signedIn))
      return fail("DOCUMENT_NOT_FOUND", 404);
    if (method === "PATCH") {
      Object.assign(document, request.postDataJSON());
      return ok(document);
    }
    if (method === "PUT") {
      if (state.failReplace) return fail("STORAGE_UNAVAILABLE", 503);
      document.fileVersion++;
      document.originalFilename = "Bản cập nhật.pdf";
      return ok(document);
    }
    if (method === "DELETE") {
      state.documents = state.documents.filter((item) => item.id !== id);
      return route.fulfill({ status: 204 });
    }
    return ok({ ...document, isOwner: state.signedIn });
  });
  return state;
}
