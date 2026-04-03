import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHookWithProviders } from "../../render";

const getCookieMock = vi.hoisted(() => vi.fn());

vi.mock("cookies-next", () => ({
  getCookie: getCookieMock,
}));

import useTranslate, {
  translateOutsideContext,
} from "../../../src/hooks/useTranslate.hook";

describe("useTranslate.hook", () => {
  beforeEach(() => {
    getCookieMock.mockReset();
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "en-US",
    });
  });

  it("formats translations inside the intl provider context", () => {
    const { result } = renderHookWithProviders(() => useTranslate());

    expect(result.current("common.success")).toBe("Success");
    expect(result.current("common.error.too-short", { length: 8 })).toBe(
      "Must be at least 8 characters",
    );
  });

  it("uses the language cookie outside the React context when available", () => {
    getCookieMock.mockReturnValue("de-DE");

    expect(translateOutsideContext()("common.success")).toBe("Erfolg");
  });

  it("falls back to the browser locale outside the React context", () => {
    getCookieMock.mockReturnValue(undefined);
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "de-DE",
    });

    expect(translateOutsideContext()("common.success")).toBe("Erfolg");
  });
});
