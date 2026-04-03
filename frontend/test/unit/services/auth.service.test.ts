import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAxiosResponse } from "../../network";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));
const getCookieMock = vi.hoisted(() => vi.fn());
const decodeJwtMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/services/api.service", () => ({
  default: apiMock,
}));
vi.mock("cookies-next", () => ({
  getCookie: getCookieMock,
}));
vi.mock("jose", () => ({
  decodeJwt: decodeJwtMock,
}));

import authService from "../../../src/services/auth.service";

describe("auth.service", () => {
  const originalLocation = window.location;

  const mockWindowLocation = () => {
    const location = {
      href: "http://localhost/",
      origin: "http://localhost",
      reload: vi.fn(),
    } as unknown as Location;

    Object.defineProperty(window, "location", {
      configurable: true,
      value: location,
    });

    return location;
  };

  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.patch.mockReset();
    apiMock.post.mockReset();
    decodeJwtMock.mockReset();
    getCookieMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("posts the correct sign-in payload for emails and usernames", async () => {
    apiMock.post.mockResolvedValue(createAxiosResponse({ ok: true }));

    await authService.signIn("user@example.com", "secret");
    await authService.signIn("pingvin", "secret");

    expect(apiMock.post).toHaveBeenNthCalledWith(1, "auth/signIn", {
      email: "user@example.com",
      password: "secret",
    });
    expect(apiMock.post).toHaveBeenNthCalledWith(2, "auth/signIn", {
      username: "pingvin",
      password: "secret",
    });
  });

  it("supports TOTP sign-in and user registration", async () => {
    apiMock.post.mockResolvedValue(createAxiosResponse({ ok: true }));

    await authService.signInTotp("123456", "login-token");
    await authService.signUp("user@example.com", "pingvin", "secret");

    expect(apiMock.post).toHaveBeenNthCalledWith(1, "auth/signIn/totp", {
      loginToken: "login-token",
      totp: "123456",
    });
    expect(apiMock.post).toHaveBeenNthCalledWith(2, "auth/signUp", {
      email: "user@example.com",
      username: "pingvin",
      password: "secret",
    });
  });

  it("redirects to the backend-provided sign-out URL when present", async () => {
    const location = mockWindowLocation();
    apiMock.post.mockResolvedValue(
      createAxiosResponse({
        redirectURI: "https://example.com/logout",
      }),
    );

    await authService.signOut();

    expect(apiMock.post).toHaveBeenCalledWith("/auth/signOut");
    expect(location.href).toBe("https://example.com/logout");
  });

  it("reloads the page when sign-out does not provide a valid redirect URI", async () => {
    const location = mockWindowLocation();
    apiMock.post.mockResolvedValue(
      createAxiosResponse({
        redirectURI: "not-a-valid-uri",
      }),
    );

    await authService.signOut();

    expect(location.reload).toHaveBeenCalledTimes(1);
  });

  it("refreshes access tokens that are close to expiring", async () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    getCookieMock.mockReturnValue("access-token");
    decodeJwtMock.mockReturnValue({
      exp: Math.floor((now + 60_000) / 1000),
    });

    await authService.refreshAccessToken();

    expect(apiMock.post).toHaveBeenCalledWith("/auth/token");
  });

  it("skips token refresh when the cookie is missing or still valid", async () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    getCookieMock.mockReturnValue(undefined);
    await authService.refreshAccessToken();

    getCookieMock.mockReturnValue("access-token");
    decodeJwtMock.mockReturnValue({
      exp: Math.floor((now + 10 * 60_000) / 1000),
    });
    await authService.refreshAccessToken();

    expect(apiMock.post).not.toHaveBeenCalled();
  });

  it("swallows refresh failures and logs a diagnostic message", async () => {
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    getCookieMock.mockReturnValue("access-token");
    decodeJwtMock.mockImplementation(() => {
      throw new Error("bad token");
    });

    await authService.refreshAccessToken();

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      "Refresh token invalid or expired",
    );
  });

  it("supports reset-password and password-update flows", async () => {
    await authService.requestResetPassword("user@example.com");
    await authService.resetPassword("reset-token", "new-secret");
    await authService.updatePassword("old-secret", "new-secret");

    expect(apiMock.post).toHaveBeenNthCalledWith(
      1,
      "/auth/resetPassword/user@example.com",
    );
    expect(apiMock.post).toHaveBeenNthCalledWith(2, "/auth/resetPassword", {
      password: "new-secret",
      token: "reset-token",
    });
    expect(apiMock.patch).toHaveBeenCalledWith("/auth/password", {
      oldPassword: "old-secret",
      password: "new-secret",
    });
  });

  it("handles TOTP setup, verification, and disable flows", async () => {
    apiMock.post
      .mockResolvedValueOnce(
        createAxiosResponse({
          qrCode: "qr-code",
          totpAuthUrl: "otpauth://pingvin",
          totpSecret: "secret",
        }),
      )
      .mockResolvedValueOnce(createAxiosResponse({}))
      .mockResolvedValueOnce(createAxiosResponse({}));

    await expect(authService.enableTOTP("password")).resolves.toEqual({
      qrCode: "qr-code",
      totpAuthUrl: "otpauth://pingvin",
      totpSecret: "secret",
    });

    await authService.verifyTOTP("123456", "password");
    await authService.disableTOTP("654321", "password");

    expect(apiMock.post).toHaveBeenNthCalledWith(1, "/auth/totp/enable", {
      password: "password",
    });
    expect(apiMock.post).toHaveBeenNthCalledWith(2, "/auth/totp/verify", {
      code: "123456",
      password: "password",
    });
    expect(apiMock.post).toHaveBeenNthCalledWith(3, "/auth/totp/disable", {
      code: "654321",
      password: "password",
    });
  });

  it("loads OAuth availability and connection status", async () => {
    apiMock.get
      .mockResolvedValueOnce(createAxiosResponse(["github"]))
      .mockResolvedValueOnce(createAxiosResponse({ github: true }));

    await expect(authService.getAvailableOAuth()).resolves.toEqual(
      createAxiosResponse(["github"]),
    );
    await expect(authService.getOAuthStatus()).resolves.toEqual(
      createAxiosResponse({ github: true }),
    );

    expect(apiMock.get).toHaveBeenNthCalledWith(1, "/oauth/available");
    expect(apiMock.get).toHaveBeenNthCalledWith(2, "/oauth/status");
  });
});
