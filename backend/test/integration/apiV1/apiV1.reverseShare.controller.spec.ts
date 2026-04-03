import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { createApiV1Context } from "../../fixtures/apiV1.fixture";
import { seedShare } from "../../fixtures/share.fixture";
import { createIntegrationApp } from "../../fixtures/test-app.fixture";

describe("Automation API v1: reverse shares", () => {
  let fixture: Awaited<ReturnType<typeof createIntegrationApp>>;

  beforeAll(async () => {
    fixture = await createIntegrationApp();
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.close();
    }
  });

  it("creates, lists, and removes reverse shares", async () => {
    const context = await createApiV1Context(fixture, {
      username: "api-v1-reverse",
      email: "api-v1-reverse@test.local",
      scopes: ["reverseShares:read", "reverseShares:write"],
    });

    const createResponse = await fixture.request
      .post("/api/v1/reverse-shares")
      .set("Authorization", context.authorization)
      .send({
        sendEmailNotification: false,
        maxShareSize: "4096",
        shareExpiration: "7-days",
        maxUseCount: 2,
        simplified: true,
        publicAccess: false,
      });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toEqual(
      expect.objectContaining({
        token: expect.any(String),
        link: expect.stringContaining("/upload/"),
      }),
    );

    const reverseShare = await fixture.prisma.reverseShare.findUnique({
      where: { token: createResponse.body.token },
    });

    const linkedShare = await seedShare(fixture, {
      id: `reverse-linked-${randomUUID().slice(0, 8)}`,
      creatorId: context.user.id,
      reverseShareId: reverseShare.id,
      uploadLocked: true,
    });

    const listResponse = await fixture.request
      .get("/api/v1/reverse-shares")
      .set("Authorization", context.authorization);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: reverseShare.id,
        token: createResponse.body.token,
        simplified: true,
        remainingUses: 2,
        shares: expect.arrayContaining([
          expect.objectContaining({
            id: linkedShare.id,
          }),
        ]),
      }),
    ]);

    const deleteResponse = await fixture.request
      .delete(`/api/v1/reverse-shares/${reverseShare.id}`)
      .set("Authorization", context.authorization);

    expect(deleteResponse.status).toBe(204);

    const afterDelete = await fixture.request
      .get("/api/v1/reverse-shares")
      .set("Authorization", context.authorization);

    expect(afterDelete.status).toBe(200);
    expect(afterDelete.body).toEqual([]);
  });

  it("rejects reverse-share mutations without the write scope", async () => {
    const context = await createApiV1Context(fixture, {
      username: "api-v1-reverse-readonly",
      email: "api-v1-reverse-readonly@test.local",
      scopes: ["reverseShares:read"],
    });

    const response = await fixture.request
      .post("/api/v1/reverse-shares")
      .set("Authorization", context.authorization)
      .send({
        sendEmailNotification: false,
        maxShareSize: "4096",
        shareExpiration: "7-days",
        maxUseCount: 1,
        simplified: false,
        publicAccess: true,
      });

    expect(response.status).toBe(403);
  });
});
