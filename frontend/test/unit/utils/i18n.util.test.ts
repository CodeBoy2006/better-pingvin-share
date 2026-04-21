import { afterEach, describe, expect, it, vi } from "vitest";
import i18nUtil from "../../../src/utils/i18n.util";
import { LOCALES } from "../../../src/i18n/locales";

vi.mock("cookies-next", () => ({
  setCookie: vi.fn(),
}));

describe("i18n.util", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the requested locale when it exists and falls back to English otherwise", () => {
    expect(i18nUtil.getLocaleByCode(LOCALES.GERMAN.code)).toEqual(
      LOCALES.GERMAN,
    );
    expect(i18nUtil.getLocaleByCode("unknown-locale")).toEqual(LOCALES.ENGLISH);
  });

  it("parses the accept-language header using exact matches first", () => {
    expect(
      i18nUtil.getLanguageFromAcceptHeader("de-DE,de;q=0.9,en;q=0.8"),
    ).toBe("de-DE");
  });

  it("falls back to a supported locale with the same base language", () => {
    expect(i18nUtil.getLanguageFromAcceptHeader("de-AT,de;q=0.9")).toBe(
      "de-DE",
    );
    expect(i18nUtil.getLanguageFromAcceptHeader("zh-HK,zh;q=0.9")).toBe(
      "zh-CN",
    );
  });

  it("falls back to English when the header is missing or unsupported", () => {
    expect(i18nUtil.getLanguageFromAcceptHeader()).toBe("en");
    expect(i18nUtil.getLanguageFromAcceptHeader("xx-YY,yy;q=0.5")).toBe("en");
  });

  it("reports whether a language code is supported", () => {
    expect(i18nUtil.isLanguageSupported("fr-FR")).toBe(true);
    expect(i18nUtil.isLanguageSupported("fr")).toBe(false);
  });

  it("persists the selected language in a lax cookie", async () => {
    const { setCookie } = await import("cookies-next");

    i18nUtil.setLanguageCookie("es-ES");

    expect(setCookie).toHaveBeenCalledWith(
      "language",
      "es-ES",
      expect.objectContaining({
        sameSite: "lax",
        expires: expect.any(Date),
      }),
    );
  });
});
