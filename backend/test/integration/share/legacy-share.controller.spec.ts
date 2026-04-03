import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { binaryResponseParser } from "../../fixtures/file.fixture";
import { buildCreateShareDto } from "../../fixtures/share.fixture";
import { createIntegrationApp } from "../../fixtures/test-app.fixture";

describe("Legacy share endpoints", () => {
  let fixture: Awaited<ReturnType<typeof createIntegrationApp>>;

  beforeAll(async () => {
    fixture = await createIntegrationApp();
    await fixture.updateConfig("share.allowUnauthenticatedShares", true);
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.close();
    }
  });

  it("supports the anonymous owner flow, files.json, and owner-token protected uploads", async () => {
    const shareId = `anonymous-owner-${randomUUID().slice(0, 8)}`;

    const createResponse = await fixture.request
      .post("/api/shares")
      .send(
        buildCreateShareDto({
          id: shareId,
        }),
      );

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toEqual(
      expect.objectContaining({
        id: shareId,
        ownerToken: expect.any(String),
        ownerManagementLink: expect.stringContaining(
          `/share/${shareId}/edit#ownerToken=`,
        ),
      }),
    );

    const duplicateResponse = await fixture.request
      .post("/api/shares")
      .send(buildCreateShareDto({ id: shareId }));

    expect(duplicateResponse.status).toBe(400);

    const ownerCookie = `share_${shareId}_owner_token=${createResponse.body.ownerToken}`;

    const ownerWithoutToken = await fixture.request.get(
      `/api/shares/${shareId}/from-owner`,
    );

    expect(ownerWithoutToken.status).toBe(403);

    const uploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=anonymous-owner.txt&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("Anonymous owner integration test file"));

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body).toEqual(
      expect.objectContaining({
        name: "anonymous-owner.txt",
      }),
    );

    const ownerPayload = await fixture.request
      .get(`/api/shares/${shareId}/from-owner`)
      .set("Cookie", ownerCookie);

    expect(ownerPayload.status).toBe(200);
    expect(ownerPayload.body.files).toHaveLength(1);
    expect(ownerPayload.body.files[0]).toEqual(
      expect.objectContaining({
        id: uploadResponse.body.id,
        name: "anonymous-owner.txt",
      }),
    );

    const completeResponse = await fixture.request
      .post(`/api/shares/${shareId}/complete`)
      .set("Cookie", ownerCookie);

    expect(completeResponse.status).toBe(202);
    expect(completeResponse.body).toEqual(
      expect.objectContaining({
        ownerToken: expect.any(String),
        ownerManagementLink: expect.stringContaining(
          `/share/${shareId}/edit#ownerToken=`,
        ),
      }),
    );

    const uploadAfterComplete = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=late-upload.txt&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("Late upload should fail"));

    expect(uploadAfterComplete.status).toBe(400);

    const publicAgent = request.agent(fixture.app.getHttpServer());
    const fileListResponse = await publicAgent.get(
      `/api/shares/${shareId}/files.json`,
    );

    expect(fileListResponse.status).toBe(200);
    expect(fileListResponse.headers["content-type"]).toMatch(
      /^application\/json\b/,
    );
    expect(fileListResponse.body).toEqual(
      expect.objectContaining({
        type: "pingvin-share-file-list",
        version: 1,
        share: expect.objectContaining({
          id: shareId,
          totalFiles: 1,
          machineReadableUrl: `http://localhost:3000/s/${shareId}/files.json`,
        }),
        files: [
          expect.objectContaining({
            id: uploadResponse.body.id,
            name: "anonymous-owner.txt",
          }),
        ],
      }),
    );
    expect(fileListResponse.body.files[0].downloadUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${uploadResponse.body.id}`,
    );
    expect(fileListResponse.body.files[0].inlineUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${uploadResponse.body.id}?download=false`,
    );
    expect(fileListResponse.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`share_${shareId}_token=`),
      ]),
    );

    const downloadUrl = new URL(fileListResponse.body.files[0].downloadUrl);
    const downloadResponse = await publicAgent
      .get(`${downloadUrl.pathname}${downloadUrl.search}`)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.body.toString()).toBe(
      "Anonymous owner integration test file",
    );

    const deleteResponse = await fixture.request
      .delete(`/api/shares/${shareId}`)
      .set("Cookie", ownerCookie);

    expect(deleteResponse.status).toBe(200);

    const deletedOwnerPayload = await fixture.request
      .get(`/api/shares/${shareId}/from-owner`)
      .set("Cookie", ownerCookie);

    expect(deletedOwnerPayload.status).toBe(404);
  });

  it("refreshes the share cookie for files.json token queries and returns clean URLs", async () => {
    const shareId = `protected-files-json-${randomUUID().slice(0, 8)}`;
    const password = "secret123";

    const createResponse = await fixture.request.post("/api/shares").send(
      buildCreateShareDto({
        id: shareId,
        security: {
          password,
        },
      }),
    );

    expect(createResponse.status).toBe(201);

    const ownerCookie = `share_${shareId}_owner_token=${createResponse.body.ownerToken}`;

    const uploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=protected-files-json.txt&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("Protected files.json integration test file"));

    expect(uploadResponse.status).toBe(201);

    const completeResponse = await fixture.request
      .post(`/api/shares/${shareId}/complete`)
      .set("Cookie", ownerCookie);

    expect(completeResponse.status).toBe(202);

    const tokenResponse = await fixture.request
      .post(`/api/shares/${shareId}/token`)
      .send({ password });

    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body).toEqual({
      token: expect.any(String),
    });

    const publicAgent = request.agent(fixture.app.getHttpServer());
    const fileListResponse = await publicAgent
      .get(`/api/shares/${shareId}/files.json`)
      .query({ token: tokenResponse.body.token });

    expect(fileListResponse.status).toBe(200);
    expect(fileListResponse.body.files[0].downloadUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${uploadResponse.body.id}`,
    );
    expect(fileListResponse.body.files[0].inlineUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${uploadResponse.body.id}?download=false`,
    );
    expect(fileListResponse.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`share_${shareId}_token=`),
      ]),
    );

    const downloadUrl = new URL(fileListResponse.body.files[0].downloadUrl);
    const downloadResponse = await publicAgent
      .get(`${downloadUrl.pathname}${downloadUrl.search}`)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.body.toString()).toBe(
      "Protected files.json integration test file",
    );
  });

  it("can return tokenized files.json URLs for password-protected shares when enabled", async () => {
    await fixture.updateConfig(
      "share.filesJsonPasswordProtectedLinksIncludeToken",
      true,
    );

    const shareId = `protected-tokenized-${randomUUID().slice(0, 8)}`;
    const password = "secret123";

    const createResponse = await fixture.request.post("/api/shares").send(
      buildCreateShareDto({
        id: shareId,
        security: {
          password,
        },
      }),
    );

    expect(createResponse.status).toBe(201);

    const ownerCookie = `share_${shareId}_owner_token=${createResponse.body.ownerToken}`;

    const uploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=protected-tokenized.txt&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("Protected tokenized files.json integration test file"));

    expect(uploadResponse.status).toBe(201);

    const completeResponse = await fixture.request
      .post(`/api/shares/${shareId}/complete`)
      .set("Cookie", ownerCookie);

    expect(completeResponse.status).toBe(202);

    const tokenResponse = await fixture.request
      .post(`/api/shares/${shareId}/token`)
      .send({ password });

    expect(tokenResponse.status).toBe(200);

    const fileListResponse = await fixture.request
      .get(`/api/shares/${shareId}/files.json`)
      .set("Cookie", `share_${shareId}_token=${tokenResponse.body.token}`);

    expect(fileListResponse.status).toBe(200);
    expect(fileListResponse.body.files[0].downloadUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${uploadResponse.body.id}?token=${encodeURIComponent(tokenResponse.body.token)}`,
    );
    expect(fileListResponse.body.files[0].inlineUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${uploadResponse.body.id}?download=false&token=${encodeURIComponent(tokenResponse.body.token)}`,
    );

    await fixture.updateConfig(
      "share.filesJsonPasswordProtectedLinksIncludeToken",
      false,
    );
  });

  it("never returns tokenized files.json URLs for unprotected shares", async () => {
    await fixture.updateConfig(
      "share.filesJsonPasswordProtectedLinksIncludeToken",
      true,
    );

    const shareId = `public-clean-links-${randomUUID().slice(0, 8)}`;

    const createResponse = await fixture.request.post("/api/shares").send(
      buildCreateShareDto({
        id: shareId,
      }),
    );

    expect(createResponse.status).toBe(201);

    const ownerCookie = `share_${shareId}_owner_token=${createResponse.body.ownerToken}`;

    const uploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=public-clean.txt&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("Public files.json integration test file"));

    expect(uploadResponse.status).toBe(201);

    const completeResponse = await fixture.request
      .post(`/api/shares/${shareId}/complete`)
      .set("Cookie", ownerCookie);

    expect(completeResponse.status).toBe(202);

    const fileListResponse = await fixture.request.get(
      `/api/shares/${shareId}/files.json`,
    );

    expect(fileListResponse.status).toBe(200);
    expect(fileListResponse.body.files[0].downloadUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${uploadResponse.body.id}`,
    );
    expect(fileListResponse.body.files[0].downloadUrl).not.toContain("token=");
    expect(fileListResponse.body.files[0].inlineUrl).not.toContain("token=");

    await fixture.updateConfig(
      "share.filesJsonPasswordProtectedLinksIncludeToken",
      false,
    );
  });
});
