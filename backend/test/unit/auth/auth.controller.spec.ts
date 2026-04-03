import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Response } from "express";
import { AuthController } from "src/auth/auth.controller";
import {
  buildAuthRegisterDto,
  buildAuthSignInDto,
  buildAuthSignInTotpDto,
  buildAuthUser,
  buildUpdatePasswordDto,
} from "../../fixtures/auth.fixture";
import { defaultConfigMockValues } from "../../fixtures/config.fixture";

const createResponseMock = () =>
  ({
    cookie: jest.fn(),
  }) as unknown as Response;

const createConfigMock = (overrides: Record<string, unknown> = {}) => ({
  get: jest.fn(
    (key: string) =>
      ({
        ...defaultConfigMockValues,
        ...overrides,
      })[key],
  ),
});

describe("AuthController", () => {
  let authService: {
    addTokensToResponse: jest.Mock;
    refreshAccessToken: jest.Mock;
    requestResetPassword: jest.Mock;
    resetPassword: jest.Mock;
    signIn: jest.Mock;
    signOut: jest.Mock;
    signUp: jest.Mock;
    updatePassword: jest.Mock;
  };
  let authTotpService: {
    disableTotp: jest.Mock;
    enableTotp: jest.Mock;
    signInTotp: jest.Mock;
    verifyTotp: jest.Mock;
  };
  let config: ReturnType<typeof createConfigMock>;
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      addTokensToResponse: jest.fn(),
      refreshAccessToken: jest.fn(),
      requestResetPassword: jest.fn(),
      resetPassword: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
      signUp: jest.fn(),
      updatePassword: jest.fn(),
    };
    authTotpService = {
      disableTotp: jest.fn(),
      enableTotp: jest.fn(),
      signInTotp: jest.fn(),
      verifyTotp: jest.fn(),
    };
    config = createConfigMock();

    controller = new AuthController(
      authService as never,
      authTotpService as never,
      config as never,
    );
  });

  it("blocks sign up when public registration is disabled", async () => {
    config = createConfigMock({
      "share.allowRegistration": false,
    });
    controller = new AuthController(
      authService as never,
      authTotpService as never,
      config as never,
    );

    await expect(
      controller.signUp(
        buildAuthRegisterDto(),
        { ip: "127.0.0.1" } as never,
        createResponseMock(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("adds refresh and access cookies when sign in returns session tokens", async () => {
    const response = createResponseMock();
    const dto = buildAuthSignInDto();
    authService.signIn.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    await expect(
      controller.signIn(dto, { ip: "127.0.0.1" } as never, response),
    ).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    expect(authService.addTokensToResponse).toHaveBeenCalledWith(
      response,
      "refresh-token",
      "access-token",
    );
  });

  it("does not set cookies when sign in requires a TOTP follow-up", async () => {
    const response = createResponseMock();
    authService.signIn.mockResolvedValue({
      loginToken: "login-token",
    });

    await expect(
      controller.signIn(
        buildAuthSignInDto(),
        { ip: "127.0.0.1" } as never,
        response,
      ),
    ).resolves.toEqual({
      loginToken: "login-token",
    });

    expect(authService.addTokensToResponse).not.toHaveBeenCalled();
  });

  it("requires a refresh token cookie to mint a new access token", async () => {
    await expect(
      controller.refreshAccessToken(
        {
          cookies: {},
        } as never,
        createResponseMock(),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("signs in through TOTP and returns the serialized token DTO", async () => {
    const response = createResponseMock();
    authTotpService.signInTotp.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    await expect(
      controller.signInTotp(buildAuthSignInTotpDto(), response),
    ).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    expect(authService.addTokensToResponse).toHaveBeenCalledWith(
      response,
      "refresh-token",
      "access-token",
    );
  });

  it("clears auth cookies on sign out and forwards any upstream redirect", async () => {
    const response = createResponseMock();
    authService.signOut.mockResolvedValue("https://issuer.example/logout");

    await expect(
      controller.signOut(
        {
          cookies: {
            access_token: "access-token",
          },
        } as never,
        response,
      ),
    ).resolves.toEqual({
      redirectURI: "https://issuer.example/logout",
    });

    expect(response.cookie).toHaveBeenNthCalledWith(
      1,
      "access_token",
      "",
      expect.objectContaining({
        maxAge: -1,
        secure: false,
      }),
    );
    expect(response.cookie).toHaveBeenNthCalledWith(
      2,
      "refresh_token",
      "",
      expect.objectContaining({
        httpOnly: true,
        maxAge: -1,
        path: "/api/auth/token",
        secure: false,
      }),
    );
  });

  it("rotates the refresh token when the password changes", async () => {
    const response = createResponseMock();
    const user = buildAuthUser();
    authService.updatePassword.mockResolvedValue({
      refreshToken: "rotated-refresh-token",
      refreshTokenId: "rotated-refresh-token-id",
    });

    await expect(
      controller.updatePassword(user, response, buildUpdatePasswordDto()),
    ).resolves.toEqual({
      refreshToken: "rotated-refresh-token",
    });

    expect(authService.addTokensToResponse).toHaveBeenCalledWith(
      response,
      "rotated-refresh-token",
    );
  });
});
