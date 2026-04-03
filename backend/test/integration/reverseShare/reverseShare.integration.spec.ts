import request from "supertest";
import { buildCreateReverseShareDto } from "../../fixtures/reverseShare.fixture";
import { createBackendIntegrationApp } from "../../helpers/backend-integration-app";

describe("Reverse share HTTP integration", () => {
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

  it("creates reverse shares and resolves them by token", async () => {
    const { user } = await context.createUser();
    const cookies = await context.issueAuthCookies(user);

    const createResponse = await request(context.app.getHttpServer())
      .post("/api/reverseShares")
      .set("Cookie", cookies)
      .send(
        buildCreateReverseShareDto({
          maxShareSize: "2048",
          maxUseCount: 2,
          publicAccess: false,
          simplified: true,
        }),
      )
      .expect(201);

    expect(createResponse.body.link).toContain(
      `/upload/${createResponse.body.token}`,
    );

    const getResponse = await request(context.app.getHttpServer())
      .get(`/api/reverseShares/${createResponse.body.token}`)
      .expect(200);

    expect(getResponse.body).toEqual(
      expect.objectContaining({
        maxShareSize: "2048",
        simplified: true,
        token: createResponse.body.token,
      }),
    );

    const storedReverseShare = await context.prisma.reverseShare.findUnique({
      where: {
        token: createResponse.body.token,
      },
    });

    expect(storedReverseShare.publicAccess).toBe(false);
    expect(storedReverseShare.remainingUses).toBe(2);
  });

  it("returns 404 for reverse shares that are no longer valid", async () => {
    const { user } = await context.createUser();
    const reverseShare = await context.prisma.reverseShare.create({
      data: {
        creatorId: user.id,
        maxShareSize: "1024",
        publicAccess: true,
        remainingUses: 0,
        sendEmailNotification: false,
        shareExpiration: new Date("2999-01-01T00:00:00.000Z"),
        simplified: false,
      },
    });

    const invalidReverseShareResponse = await request(
      context.app.getHttpServer(),
    ).get(`/api/reverseShares/${reverseShare.token}`);
    expect(invalidReverseShareResponse.status).toBe(404);
  });

  it("lists only active reverse shares for the current user", async () => {
    const { user } = await context.createUser();
    const cookies = await context.issueAuthCookies(user);
    const activeReverseShare = await context.prisma.reverseShare.create({
      data: {
        creatorId: user.id,
        maxShareSize: "1024",
        publicAccess: true,
        remainingUses: 2,
        sendEmailNotification: false,
        shareExpiration: new Date("2999-01-01T00:00:00.000Z"),
        simplified: false,
      },
    });
    await context.prisma.reverseShare.create({
      data: {
        creatorId: user.id,
        maxShareSize: "1024",
        publicAccess: true,
        remainingUses: 2,
        sendEmailNotification: false,
        shareExpiration: new Date("2000-01-01T00:00:00.000Z"),
        simplified: false,
      },
    });
    await context.prisma.share.create({
      data: {
        creatorId: user.id,
        expiration: new Date("2999-01-02T00:00:00.000Z"),
        reverseShareId: activeReverseShare.id,
      },
    });

    const response = await request(context.app.getHttpServer())
      .get("/api/reverseShares")
      .set("Cookie", cookies)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toEqual(
      expect.objectContaining({
        id: activeReverseShare.id,
        remainingUses: 2,
      }),
    );
    expect(response.body[0].shares).toHaveLength(1);
  });
});
