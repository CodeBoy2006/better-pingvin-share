import request from "supertest";
import { buildCreateUserDto } from "../../fixtures/user.fixture";
import { createBackendIntegrationApp } from "../../helpers/backend-integration-app";

describe("User HTTP integration", () => {
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
  });

  it("returns the current user DTO with password and ldap flags", async () => {
    const { user } = await context.createUser({
      ldapDN: null,
    });
    const cookies = await context.issueAuthCookies(user);

    const response = await request(context.app.getHttpServer())
      .get("/api/users/me")
      .set("Cookie", cookies)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        email: user.email,
        hasPassword: true,
        id: user.id,
        isLdap: false,
        username: user.username,
      }),
    );
  });

  it("blocks user management for non-admin users", async () => {
    const { user } = await context.createUser({
      isAdmin: false,
    });
    const cookies = await context.issueAuthCookies(user);

    await request(context.app.getHttpServer())
      .get("/api/users")
      .set("Cookie", cookies)
      .expect(403);
  });

  it("allows admins to create invited users without a password", async () => {
    const { user } = await context.createUser({
      isAdmin: true,
    });
    const cookies = await context.issueAuthCookies(user);
    const dto = buildCreateUserDto({
      password: undefined,
    });

    const response = await request(context.app.getHttpServer())
      .post("/api/users")
      .set("Cookie", cookies)
      .send(dto)
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        email: dto.email,
        isAdmin: false,
        username: dto.username,
      }),
    );
    expect(context.emailService.sendInviteEmail).toHaveBeenCalledWith(
      dto.email,
      expect.any(String),
    );
  });

  it("clears authentication cookies when a user deletes its own account", async () => {
    const { user } = await context.createUser();
    const cookies = await context.issueAuthCookies(user);

    const response = await request(context.app.getHttpServer())
      .delete("/api/users/me")
      .set("Cookie", cookies)
      .expect(204);

    expect(
      (response.headers["set-cookie"] as string[]).some((cookie) =>
        cookie.startsWith("access_token=accessToken;"),
      ),
    ).toBe(true);
    expect(
      (response.headers["set-cookie"] as string[]).some((cookie) =>
        cookie.startsWith("refresh_token=;"),
      ),
    ).toBe(true);
  });
});
