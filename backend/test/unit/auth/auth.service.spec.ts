import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon from "argon2";
import { GenericOidcProvider } from "src/oauth/provider/genericOidc.provider";
import { AuthService } from "src/auth/auth.service";
import {
  buildAuthRegisterDto,
  buildAuthSignInDto,
  buildAuthUser,
} from "../../fixtures/auth.fixture";
import { defaultConfigMockValues } from "../../fixtures/config.fixture";
import { createUniqueConstraintError } from "../../helpers/prisma-test-error";

const createConfigMock = (overrides: Record<string, unknown> = {}) => {
  const values = {
    ...defaultConfigMockValues,
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => {
      if (!(key in values)) {
        throw new Error(`Missing config mock for ${key}`);
      }

      return values[key];
    }),
  };
};

const createPrismaMock = () => ({
  loginToken: {
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  resetPasswordToken: {
    create: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
  },
  user: {
    count: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
});

describe("AuthService", () => {
  let authService: AuthService;
  let config: ReturnType<typeof createConfigMock>;
  let prisma: ReturnType<typeof createPrismaMock>;
  let jwtService: {
    decode: jest.Mock;
    sign: jest.Mock;
    verifyAsync: jest.Mock;
  };
  let emailService: {
    sendResetPasswordEmail: jest.Mock;
  };
  let ldapService: {
    authenticateUser: jest.Mock;
  };
  let userService: {
    findOrCreateFromLDAP: jest.Mock;
  };
  let oAuthService: {
    availableProviders: jest.Mock;
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    config = createConfigMock();
    jwtService = {
      decode: jest.fn(),
      sign: jest.fn().mockReturnValue("signed-access-token"),
      verifyAsync: jest.fn(),
    };
    emailService = {
      sendResetPasswordEmail: jest.fn(),
    };
    ldapService = {
      authenticateUser: jest.fn(),
    };
    userService = {
      findOrCreateFromLDAP: jest.fn(),
    };
    oAuthService = {
      availableProviders: jest.fn().mockReturnValue({}),
    };

    authService = new AuthService(
      prisma as never,
      jwtService as never,
      config as never,
      emailService as never,
      ldapService as never,
      userService as never,
      oAuthService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("signs up the first user as admin and returns tokens", async () => {
    const dto = buildAuthRegisterDto();
    const createdUser = buildAuthUser({
      email: dto.email,
      isAdmin: true,
      username: dto.username,
    });
    prisma.user.count.mockResolvedValue(0);
    prisma.user.create.mockResolvedValue(createdUser);
    jest.spyOn(authService, "createRefreshToken").mockResolvedValue({
      refreshToken: "refresh-token",
      refreshTokenId: "refresh-token-id",
    });
    jest
      .spyOn(authService, "createAccessToken")
      .mockResolvedValue("access-token");

    const result = await authService.signUp(dto, "127.0.0.1");

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: dto.email,
        isAdmin: true,
        username: dto.username,
      }),
    });
    expect(
      await argon.verify(
        prisma.user.create.mock.calls[0][0].data.password,
        dto.password,
      ),
    ).toBe(true);
    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: createdUser,
    });
  });

  it("translates duplicate signup errors into a bad request", async () => {
    prisma.user.count.mockResolvedValue(0);
    prisma.user.create.mockRejectedValue(createUniqueConstraintError("email"));

    await expect(
      authService.signUp(buildAuthRegisterDto(), "127.0.0.1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires an email or username on sign in", async () => {
    await expect(
      authService.signIn(buildAuthSignInDto({ email: undefined }), "127.0.0.1"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("signs in with a password when password auth is enabled", async () => {
    const password = "Password123!";
    const user = buildAuthUser({
      password: await argon.hash(password),
    });
    prisma.user.findFirst.mockResolvedValue(user);
    const generateTokenSpy = jest
      .spyOn(authService, "generateToken")
      .mockResolvedValue({
        accessToken: "access-token",
        refreshToken: "refresh-token",
      });

    const result = await authService.signIn(
      buildAuthSignInDto({
        email: user.email,
        password,
      }),
      "127.0.0.1",
    );

    expect(generateTokenSpy).toHaveBeenCalledWith(user);
    expect(ldapService.authenticateUser).not.toHaveBeenCalled();
    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("falls back to LDAP sign in when password auth does not match", async () => {
    const dto = buildAuthSignInDto({
      email: "ldap@example.com",
      password: "Password123!",
      username: "ldap_user",
    });
    const ldapEntry = {
      dn: "cn=ldap-user,dc=example,dc=com",
    };
    const user = buildAuthUser({
      email: dto.email,
      username: dto.username,
    });
    prisma.user.findFirst.mockResolvedValue(null);
    config = createConfigMock({
      "ldap.enabled": true,
    });
    authService = new AuthService(
      prisma as never,
      jwtService as never,
      config as never,
      emailService as never,
      ldapService as never,
      userService as never,
      oAuthService as never,
    );
    ldapService.authenticateUser.mockResolvedValue(ldapEntry);
    userService.findOrCreateFromLDAP.mockResolvedValue(user);
    jest.spyOn(authService, "generateToken").mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });

    const result = await authService.signIn(dto, "127.0.0.1");

    expect(ldapService.authenticateUser).toHaveBeenCalledWith(
      dto.username,
      dto.password,
    );
    expect(userService.findOrCreateFromLDAP).toHaveBeenCalledWith(
      dto,
      ldapEntry,
    );
    expect(result).toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  it("returns a login token instead of session cookies when TOTP is verified", async () => {
    const user = buildAuthUser({
      totpVerified: true,
    });
    jest
      .spyOn(authService, "createLoginToken")
      .mockResolvedValue("login-token");

    await expect(authService.generateToken(user)).resolves.toEqual({
      loginToken: "login-token",
    });
  });

  it("requests a password reset and replaces previous reset tokens", async () => {
    const user = buildAuthUser();
    prisma.user.findFirst.mockResolvedValue({
      ...user,
      resetPasswordToken: {
        token: "existing-reset-token",
      },
    });
    prisma.resetPasswordToken.delete.mockResolvedValue(undefined);
    prisma.resetPasswordToken.create.mockResolvedValue({
      token: "new-reset-token",
    });

    await authService.requestResetPassword(user.email);

    expect(prisma.resetPasswordToken.delete).toHaveBeenCalledWith({
      where: { token: "existing-reset-token" },
    });
    expect(emailService.sendResetPasswordEmail).toHaveBeenCalledWith(
      user.email,
      "new-reset-token",
    );
  });

  it("blocks password reset when password auth is disabled", async () => {
    config = createConfigMock({
      "oauth.disablePassword": true,
    });
    authService = new AuthService(
      prisma as never,
      jwtService as never,
      config as never,
      emailService as never,
      ldapService as never,
      userService as never,
      oAuthService as never,
    );

    await expect(
      authService.requestResetPassword("user@example.com"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects expired password reset tokens", async () => {
    prisma.resetPasswordToken.findFirst.mockResolvedValue(null);

    await expect(
      authService.resetPassword("expired-token", "NewPassword123!"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates a password, clears existing refresh tokens, and issues a new refresh token", async () => {
    const currentPassword = "CurrentPassword123!";
    const user = buildAuthUser({
      password: await argon.hash(currentPassword),
    });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    prisma.user.update.mockResolvedValue(undefined);
    jest.spyOn(authService, "createRefreshToken").mockResolvedValue({
      refreshToken: "next-refresh-token",
      refreshTokenId: "next-refresh-token-id",
    });

    await expect(
      authService.updatePassword(user, "NewPassword123!", currentPassword),
    ).resolves.toEqual({
      refreshToken: "next-refresh-token",
      refreshTokenId: "next-refresh-token-id",
    });

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      data: {
        password: expect.any(String),
      },
      where: { id: user.id },
    });
  });

  it("rejects refresh tokens that are missing or expired", async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    });

    await expect(
      authService.refreshAccessToken("expired-refresh-token"),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns an OIDC logout redirect when the provider supports RP-initiated logout", async () => {
    const provider = Object.create(
      GenericOidcProvider.prototype,
    ) as GenericOidcProvider & {
      getConfiguration: jest.Mock;
    };

    provider.getConfiguration = jest.fn().mockResolvedValue({
      end_session_endpoint: "https://issuer.example/logout",
    });
    jwtService.decode.mockReturnValue({
      refreshTokenId: "refresh-token-id",
    });
    prisma.refreshToken.findFirst.mockResolvedValue({
      oauthIDToken: "oidc:id-token-hint",
    });
    prisma.refreshToken.delete.mockResolvedValue(undefined);
    config = createConfigMock({
      "oauth.oidc-clientId": "oidc-client-id",
      "oauth.oidc-enabled": true,
      "oauth.oidc-signOut": true,
    });
    oAuthService.availableProviders.mockReturnValue({
      oidc: provider,
    });
    authService = new AuthService(
      prisma as never,
      jwtService as never,
      config as never,
      emailService as never,
      ldapService as never,
      userService as never,
      oAuthService as never,
    );

    const redirectUri = await authService.signOut("access-token");

    expect(redirectUri).toContain("https://issuer.example/logout?");
    expect(redirectUri).toContain(
      "post_logout_redirect_uri=http%3A%2F%2Flocalhost%3A3000",
    );
    expect(redirectUri).toContain("id_token_hint=id-token-hint");
    expect(redirectUri).toContain("client_id=oidc-client-id");
  });
});
