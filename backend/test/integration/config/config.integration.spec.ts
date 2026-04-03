import request from "supertest";
import { buildConfigUpdate } from "../../fixtures/config.fixture";
import { createBackendIntegrationApp } from "../../helpers/backend-integration-app";

describe("Config HTTP integration", () => {
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
    await context.setConfig("share.shareIdLength", 8);
  });

  it("lists public config without exposing secret values", async () => {
    const response = await request(context.app.getHttpServer())
      .get("/api/configs")
      .expect(200);

    expect(response.body.length).toBeGreaterThan(0);
    expect(
      response.body.some(
        (entry: { key: string }) => entry.key === "general.appName",
      ),
    ).toBe(true);
    expect(
      response.body.some(
        (entry: { key: string }) => entry.key === "internal.jwtSecret",
      ),
    ).toBe(false);
  });

  it("protects admin config categories from non-admin users", async () => {
    const { user } = await context.createUser({
      isAdmin: false,
    });
    const cookies = await context.issueAuthCookies(user);

    await request(context.app.getHttpServer())
      .get("/api/configs/admin/share")
      .set("Cookie", cookies)
      .expect(403);
  });

  it("returns editable config categories for admins and validates updates", async () => {
    const { user } = await context.createUser({
      isAdmin: true,
    });
    const cookies = await context.issueAuthCookies(user);

    const categoryResponse = await request(context.app.getHttpServer())
      .get("/api/configs/admin/share")
      .set("Cookie", cookies)
      .expect(200);

    expect(categoryResponse.body.length).toBeGreaterThan(0);
    expect(
      categoryResponse.body.every(
        (entry: { allowEdit: boolean; key: string }) =>
          entry.allowEdit && entry.key.startsWith("share."),
      ),
    ).toBe(true);

    const invalidUpdateResponse = await request(context.app.getHttpServer())
      .patch("/api/configs/admin")
      .set("Cookie", cookies)
      .send([buildConfigUpdate("share.shareIdLength", 1)]);

    expect(invalidUpdateResponse.status).toBe(400);

    const updateResponse = await request(context.app.getHttpServer())
      .patch("/api/configs/admin")
      .set("Cookie", cookies)
      .send([
        buildConfigUpdate("share.shareIdLength", 10),
        buildConfigUpdate("share.allowRegistration", false),
      ])
      .expect(200);

    expect(
      updateResponse.body.find(
        (entry: { name: string }) => entry.name === "shareIdLength",
      ).value,
    ).toBe("10");

    const storedConfig = await context.prisma.config.findUnique({
      where: {
        name_category: {
          category: "share",
          name: "allowRegistration",
        },
      },
    });

    expect(storedConfig.value).toBe("false");
  });
});
