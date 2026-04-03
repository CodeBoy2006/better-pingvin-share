import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { authenticator } from "otplib";
import { AuthTotpService } from "src/auth/authTotp.service";
import {
  buildAuthSignInTotpDto,
  buildAuthUser,
} from "../../fixtures/auth.fixture";
import { defaultConfigMockValues } from "../../fixtures/config.fixture";

describe("AuthTotpService", () => {
  let authService: {
    createAccessToken: jest.Mock;
    createRefreshToken: jest.Mock;
    verifyPassword: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let prisma: {
    loginToken: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: AuthTotpService;

  beforeEach(() => {
    authService = {
      createAccessToken: jest.fn().mockResolvedValue("access-token"),
      createRefreshToken: jest.fn().mockResolvedValue({
        refreshToken: "refresh-token",
        refreshTokenId: "refresh-token-id",
      }),
      verifyPassword: jest.fn().mockResolvedValue(true),
    };
    configService = {
      get: jest.fn((key: string) => defaultConfigMockValues[key]),
    };
    prisma = {
      loginToken: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new AuthTotpService(
      prisma as never,
      configService as never,
      authService as never,
    );
  });

  it("rejects missing or already-consumed login tokens", async () => {
    prisma.loginToken.findFirst.mockResolvedValue(null);

    await expect(
      service.signInTotp(buildAuthSignInTotpDto()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects expired login tokens", async () => {
    prisma.loginToken.findFirst.mockResolvedValue({
      expiresAt: new Date("2023-12-31T23:59:59.000Z"),
      token: "login-token",
      used: false,
      user: buildAuthUser({
        totpSecret: authenticator.generateSecret(),
      }),
    });

    await expect(
      service.signInTotp(buildAuthSignInTotpDto()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("exchanges a valid login token and TOTP code for session tokens", async () => {
    const totpSecret = authenticator.generateSecret();
    const user = buildAuthUser({
      totpSecret,
    });
    prisma.loginToken.findFirst.mockResolvedValue({
      expiresAt: new Date("2999-01-01T00:00:00.000Z"),
      token: "login-token",
      used: false,
      user,
    });

    const result = await service.signInTotp(
      buildAuthSignInTotpDto({
        totp: authenticator.generate(totpSecret),
      }),
    );

    expect(prisma.loginToken.update).toHaveBeenCalledWith({
      data: { used: true },
      where: { token: "login-token" },
    });
    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("requires the current password before enabling TOTP", async () => {
    authService.verifyPassword.mockResolvedValue(false);

    await expect(
      service.enableTotp(buildAuthUser(), "wrong-password"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("persists a generated TOTP secret and QR code when enabling TOTP", async () => {
    prisma.user.findUnique.mockResolvedValue({
      totpVerified: false,
    });

    const result = await service.enableTotp(buildAuthUser(), "Password123!");

    expect(prisma.user.update).toHaveBeenCalledWith({
      data: {
        totpEnabled: true,
        totpSecret: expect.any(String),
      },
      where: {
        id: expect.any(String),
      },
    });
    expect(result.totpAuthUrl).toContain("otpauth://totp/");
    expect(result.qrCode).toContain("data:image/svg+xml;base64,");
  });

  it("requires an in-progress TOTP secret before verification", async () => {
    prisma.user.findUnique.mockResolvedValue({
      totpSecret: null,
    });

    await expect(
      service.verifyTotp(buildAuthUser(), "Password123!", "123456"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("verifies TOTP codes against the persisted secret", async () => {
    const totpSecret = authenticator.generateSecret();
    prisma.user.findUnique.mockResolvedValue({
      totpSecret,
    });

    await expect(
      service.verifyTotp(
        buildAuthUser(),
        "Password123!",
        authenticator.generate(totpSecret),
      ),
    ).resolves.toBe(true);

    expect(prisma.user.update).toHaveBeenCalledWith({
      data: {
        totpVerified: true,
      },
      where: {
        id: expect.any(String),
      },
    });
  });

  it("disables TOTP when the password and code are valid", async () => {
    const totpSecret = authenticator.generateSecret();
    prisma.user.findUnique.mockResolvedValue({
      totpSecret,
    });

    await expect(
      service.disableTotp(
        buildAuthUser(),
        "Password123!",
        authenticator.generate(totpSecret),
      ),
    ).resolves.toBe(true);

    expect(prisma.user.update).toHaveBeenCalledWith({
      data: {
        totpEnabled: false,
        totpSecret: null,
        totpVerified: false,
      },
      where: {
        id: expect.any(String),
      },
    });
  });
});
