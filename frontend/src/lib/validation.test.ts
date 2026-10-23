import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "./constants";
import { safeRedirect } from "./safeRedirect";
import { titleFromFile, validateField, validateFile } from "./validation";

describe("client validation and redirect protection", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/a\\evil",
    "/a\nb",
    null,
  ])("rejects unsafe redirect %s", (value) =>
    expect(safeRedirect(value)).toBe("/me/documents"),
  );
  it("preserves a local path with query", () =>
    expect(safeRedirect("/?q=giải&page=2")).toBe("/?q=giải&page=2"));
  it("counts Unicode code points and keeps password whitespace", () => {
    expect(validateField("title", "😀".repeat(200))).toBeUndefined();
    expect(validateField("title", "😀".repeat(201))).toBeTruthy();
    expect(validateField("password", "        ", true)).toBeUndefined();
    expect(validateField("description", "a\nb\tc")).toBeUndefined();
    expect(validateField("title", "a\nb")).toBeTruthy();
  });
  it.each(["email", "password", "displayName", "title", "visibility"])(
    "requires %s",
    (field) => expect(validateField(field, "", true)).toBeTruthy(),
  );
  it("requires explicit visibility and validates metadata limits", () => {
    expect(validateField("visibility", "PRIVATE")).toBeUndefined();
    expect(validateField("email", "invalid")).toBeTruthy();
    expect(validateField("password", "short", true)).toBeTruthy();
    expect(validateField("displayName", "a".repeat(101))).toBeTruthy();
    expect(validateField("description", "a".repeat(2001))).toBeTruthy();
  });
  it("enforces exact 50 MiB boundaries, zero size and extensions", () => {
    const file = new File(["x"], "ĐỀ CƯƠNG.PDF");
    Object.defineProperty(file, "size", {
      value: MAX_UPLOAD_BYTES,
      configurable: true,
    });
    expect(validateFile(file)).toBeUndefined();
    Object.defineProperty(file, "size", { value: MAX_UPLOAD_BYTES + 1 });
    expect(validateFile(file)).toContain("50 MB");
    expect(validateFile(new File([], "empty.pdf"))).toContain("rỗng");
    expect(validateFile(new File(["x"], "bad.exe"))).toContain(
      "PDF, DOCX, PPTX",
    );
    expect(titleFromFile(new File(["x"], "Đề cương.pdf"))).toBe("Đề cương");
  });
  it.each(["pdf", "docx", "pptx"])(
    "accepts the approved %s extension",
    (extension) => {
      expect(
        validateFile(new File(["content"], `Tài liệu.${extension}`)),
      ).toBeUndefined();
    },
  );
});
