import { describe, expect, test } from "bun:test";
import { safeBackPath } from "./safe-back-path";

describe("safeBackPath", () => {
  test("rejects an absolute cross-origin URL", () => {
    expect(safeBackPath("https://evil.example")).toBe("/admin/emails");
  });

  test("rejects a protocol-relative URL", () => {
    expect(safeBackPath("//evil.example")).toBe("/admin/emails");
  });

  test("rejects a backslash-based URL", () => {
    expect(safeBackPath("/\\evil")).toBe("/admin/emails");
  });

  test("rejects a path outside /admin", () => {
    expect(safeBackPath("/other")).toBe("/admin/emails");
  });

  test("rejects an undefined value", () => {
    expect(safeBackPath(undefined)).toBe("/admin/emails");
  });

  test("keeps a same-origin /admin path with a query string", () => {
    expect(safeBackPath("/admin/emails?direction=inbound")).toBe(
      "/admin/emails?direction=inbound",
    );
  });
});
