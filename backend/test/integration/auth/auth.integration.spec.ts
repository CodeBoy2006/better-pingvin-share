import { authenticator } from "otplib";
import request from "supertest";
import {
  buildAuthRegisterDto,
  buildAuthSignInDto,
  buildUpdatePasswordDto,
} from "../../fixtures/auth.fixture";
import { createBackendIntegrationApp } from "../../helpers/backend-integration-app";

const getSetCookies = (response: request.Response): string[] =>
  Array.isArray(response.headers["set-cookie"])
    ? response.headers["set-cookie"]
    : response.headers["set-cookie"]
      ? [response.headers["set-cookie"]]
      : [];

const getCookieByName = (cookies: string[], name: string) =>
  cookies.find((cookie) => cookie.startsWith(`${name}=`));

describe("Auth HTTP integration", () => {
  let context: Awaited<ReturnType<typeof createBackendIntegrationApp>>;

  beforeAll(async () => {
    context = await createBackendIntegrationApp();
  });

  afterAll(async () => {
    if (context) {
      await context.close();
    }
  });

  beforeEach(async () => {
    await context.clearData();
    await context.setConfig("share.allowRegistration", true);
    await context.setConfig("oauth.disablePassword", false);
    await context.setConfig("oauth.ignoreTotp", true);
  });

  it("signs up the first user, promotes it to admin, and sets auth cookies", async () => {
    const response = await request(context.app.getHttpServer())
      .post("/api/auth/signUp")
      .send(buildAuthRegisterDto())
      .expect(201);

    expect(response.body.user.isAdmin).toBe(true);
    expect(
      getCookieByName(getSetCookies(response), "access_token"),
    ).toBeTruthy();
    expect(
      getCookieByName(getSetCookies(response), "refresh_token"),
    ).toBeTruthy();
  });

  it("requires a TOTP follow-up when the user has verified TOTP enabled", async () => {
    const totpSecret = authenticator.generateSecret();
    const { plainPassword, user } = await context.createUser({
      plainPassword: "Password123!",
      totpEnabled: true,
      totpSecret,
      totpVerified: true,
    });

    const signInResponse = await request(context.app.getHttpServer())
      .post("/api/auth/signIn")
      .send(
        buildAuthSignInDto({
          email: user.email,
          password: plainPassword,
        }),
      )
      .expect(200);

    expect(signInResponse.body.loginToken).toEqual(expect.any(String));
    expect(getSetCookies(signInResponse)).toHaveLength(0);

    const totpResponse = await request(context.app.getHttpServer())
      .post("/api/auth/signIn/totp")
      .send({
        loginToken: signInResponse.body.loginToken,
        totp: authenticator.generate(totpSecret),
      })
      .expect(200);

    expect(totpResponse.body.accessToken).toEqual(expect.any(String));
    expect(totpResponse.body.refreshToken).toEqual(expect.any(String));
    expect(
      getCookieByName(getSetCookies(totpResponse), "access_token"),
    ).toBeTruthy();
    expect(
      getCookieByName(getSetCookies(totpResponse), "refresh_token"),
    ).toBeTruthy();
  });

  it("creates and consumes password reset tokens", async () => {
    const { plainPassword, user } = await context.createUser({
      plainPassword: "Password123!",
    });

    await request(context.app.getHttpServer())
      .post(`/api/auth/resetPassword/${encodeURIComponent(user.email)}`)
      .expect(202);

    const resetToken = await context.prisma.resetPasswordToken.findFirst({
      where: {
        userId: user.id,
      },
    });

    expect(context.emailService.sendResetPasswordEmail).toHaveBeenCalledWith(
      user.email,
      resetToken.token,
    );

    await request(context.app.getHttpServer())
      .post("/api/auth/resetPassword")
      .send({
        password: "ResetPassword123!",
        token: resetToken.token,
      })
      .expect(204);

    const failedOldPasswordSignIn = await request(context.app.getHttpServer())
      .post("/api/auth/signIn")
      .send(
        buildAuthSignInDto({
          email: user.email,
          password: plainPassword,
        }),
      );

    expect(failedOldPasswordSignIn.status).toBe(401);

    await request(context.app.getHttpServer())
      .post("/api/auth/signIn")
      .send(
        buildAuthSignInDto({
          email: user.email,
          password: "ResetPassword123!",
        }),
      )
      .expect(200);
  });

  it("refreshes sessions and rotates passwords through the authenticated endpoints", async () => {
    const { plainPassword, user } = await context.createUser({
      plainPassword: "Password123!",
    });

    const signInResponse = await request(context.app.getHttpServer())
      .post("/api/auth/signIn")
      .send(
        buildAuthSignInDto({
          email: user.email,
          password: plainPassword,
        }),
      )
      .expect(200);

    const cookies = getSetCookies(signInResponse);
    const accessCookie = getCookieByName(cookies, "access_token");
    const refreshCookie = getCookieByName(cookies, "refresh_token");

    const refreshResponse = await request(context.app.getHttpServer())
      .post("/api/auth/token")
      .set("Cookie", [refreshCookie])
      .expect(200);

    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    expect(
      getCookieByName(getSetCookies(refreshResponse), "access_token"),
    ).toBeTruthy();

    const updatePasswordResponse = await request(context.app.getHttpServer())
      .patch("/api/auth/password")
      .set("Cookie", [accessCookie])
      .send(
        buildUpdatePasswordDto({
          oldPassword: plainPassword,
          password: "NewPassword123!",
        }),
      )
      .expect(200);

    expect(updatePasswordResponse.body.refreshToken).toEqual(
      expect.any(String),
    );
    expect(
      getCookieByName(getSetCookies(updatePasswordResponse), "refresh_token"),
    ).toBeTruthy();

    const failedRotatedPasswordSignIn = await request(
      context.app.getHttpServer(),
    )
      .post("/api/auth/signIn")
      .send(
        buildAuthSignInDto({
          email: user.email,
          password: plainPassword,
        }),
      );

    expect(failedRotatedPasswordSignIn.status).toBe(401);

    await request(context.app.getHttpServer())
      .post("/api/auth/signIn")
      .send(
        buildAuthSignInDto({
          email: user.email,
          password: "NewPassword123!",
        }),
      )
      .expect(200);
  });
});
