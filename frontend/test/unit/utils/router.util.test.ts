import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "../../../src/utils/router.util";

describe("router.util", () => {
  it("normalizes empty and relative redirect targets", () => {
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("upload")).toBe("/upload");
    expect(safeRedirectPath("  /account  ")).toBe("/account");
  });

  it("rejects protocol-relative redirect targets", () => {
    expect(safeRedirectPath("//evil.example")).toBe("/");
  });
});
