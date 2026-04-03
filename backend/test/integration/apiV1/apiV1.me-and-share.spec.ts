import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { createApiV1Context } from "../../fixtures/apiV1.fixture";
import { buildChunkUploadQuery } from "../../fixtures/file.fixture";
import { buildCreateShareDto } from "../../fixtures/share.fixture";
import { createIntegrationApp } from "../../fixtures/test-app.fixture";

describe("Automation API v1: me and shares", () => {
  let fixture: Awaited<ReturnType<typeof createIntegrationApp>>;

  beforeAll(async () => {
    fixture = await createIntegrationApp();
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.close();
    }
  });

  it("returns the current API principal and normalized scopes", async () => {
    const context = await createApiV1Context(fixture, {
      username: "api-v1-me",
      email: "api-v1-me@test.local",
      isAdmin: true,
    });

    const response = await fixture.request
      .get("/api/v1/me")
      .set("Authorization", context.authorization);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: context.user.id,
        username: "api-v1-me",
        email: "api-v1-me@test.local",
        isAdmin: true,
        hasPassword: true,
        isLdap: false,
        tokenId: context.apiToken.split(".")[0].replace("psk_", ""),
        scopes: expect.arrayContaining(["shares:read", "files:write"]),
      }),
    );
  });

  it("rejects invalid bearer tokens", async () => {
    const response = await fixture.request
      .get("/api/v1/me")
      .set("Authorization", "Bearer psk_invalid.secret");

    expect(response.status).toBe(401);
  });

  it("creates draft shares, uploads chunks, completes them, and expires them on delete", async () => {
    const context = await createApiV1Context(fixture, {
      username: "api-v1-owner",
      email: "api-v1-owner@test.local",
      scopes: ["shares:read", "shares:write", "files:read", "files:write"],
    });
    const shareId = `api-v1-share-${randomUUID().slice(0, 8)}`;

    const createResponse = await fixture.request
      .post("/api/v1/shares")
      .set("Authorization", context.authorization)
      .send(
        buildCreateShareDto({
          id: shareId,
          name: "Automation share",
        }),
      );

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toEqual(
      expect.objectContaining({
        id: shareId,
        uploadLocked: false,
        files: [],
      }),
    );

    const uploadQuery = buildChunkUploadQuery({
      name: "chunk-file.txt",
    });
    const uploadResponse = await fixture.request
      .post(`/api/v1/shares/${shareId}/files`)
      .query(uploadQuery)
      .set("Authorization", context.authorization)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("Batch C automation API chunk upload"));

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body).toEqual(
      expect.objectContaining({
        id: uploadQuery.id,
        name: "chunk-file.txt",
      }),
    );

    const getResponse = await fixture.request
      .get(`/api/v1/shares/${shareId}`)
      .set("Authorization", context.authorization);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.files).toHaveLength(1);
    expect(getResponse.body.files[0]).toEqual(
      expect.objectContaining({
        id: uploadQuery.id,
        name: "chunk-file.txt",
      }),
    );

    const completeResponse = await fixture.request
      .post(`/api/v1/shares/${shareId}/complete`)
      .set("Authorization", context.authorization);

    expect(completeResponse.status).toBe(202);
    expect(completeResponse.body.uploadLocked).toBe(true);

    const listResponse = await fixture.request
      .get("/api/v1/shares")
      .set("Authorization", context.authorization);

    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: shareId,
        uploadLocked: true,
        files: [
          expect.objectContaining({
            id: uploadQuery.id,
            name: "chunk-file.txt",
          }),
        ],
      }),
    ]);

    const revertResponse = await fixture.request
      .delete(`/api/v1/shares/${shareId}/complete`)
      .set("Authorization", context.authorization);

    expect(revertResponse.status).toBe(200);
    expect(revertResponse.body.uploadLocked).toBe(false);

    const deleteResponse = await fixture.request
      .delete(`/api/v1/shares/${shareId}`)
      .set("Authorization", context.authorization);

    expect(deleteResponse.status).toBe(204);

    const persistedShare = await fixture.prisma.share.findUnique({
      where: { id: shareId },
    });

    expect(persistedShare).toEqual(
      expect.objectContaining({
        id: shareId,
      }),
    );
    expect(new Date(persistedShare.expiration).getTime()).toBeLessThanOrEqual(
      Date.now(),
    );
  });

  it("rejects duplicate identifiers and unauthorized ownership access", async () => {
    const owner = await createApiV1Context(fixture, {
      username: "api-v1-primary",
      email: "api-v1-primary@test.local",
      scopes: ["shares:read", "shares:write", "files:read", "files:write"],
    });
    const outsider = await createApiV1Context(fixture, {
      username: "api-v1-outsider",
      email: "api-v1-outsider@test.local",
      scopes: ["shares:read", "shares:write"],
    });
    const shareId = `api-v1-protected-${randomUUID().slice(0, 8)}`;

    const firstCreate = await fixture.request
      .post("/api/v1/shares")
      .set("Authorization", owner.authorization)
      .send(buildCreateShareDto({ id: shareId }));

    expect(firstCreate.status).toBe(201);

    const duplicateCreate = await fixture.request
      .post("/api/v1/shares")
      .set("Authorization", owner.authorization)
      .send(buildCreateShareDto({ id: shareId }));

    expect(duplicateCreate.status).toBe(400);

    const outsiderGet = await fixture.request
      .get(`/api/v1/shares/${shareId}`)
      .set("Authorization", outsider.authorization);

    expect(outsiderGet.status).toBe(404);
  });
});
