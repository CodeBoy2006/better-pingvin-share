import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { createApiV1Context } from "../../fixtures/apiV1.fixture";
import {
  binaryResponseParser,
  buildChunkUploadQuery,
} from "../../fixtures/file.fixture";
import { buildCreateShareDto, seedShare } from "../../fixtures/share.fixture";
import { createIntegrationApp } from "../../fixtures/test-app.fixture";

describe("Automation API v1: files", () => {
  let fixture: Awaited<ReturnType<typeof createIntegrationApp>>;

  beforeAll(async () => {
    fixture = await createIntegrationApp();
  });

  afterAll(async () => {
    if (fixture) {
      await fixture.close();
    }
  });

  it("supports multipart uploads, inline downloads, ZIP downloads, and file removal", async () => {
    const context = await createApiV1Context(fixture, {
      username: "api-v1-file-owner",
      email: "api-v1-file-owner@test.local",
      scopes: ["shares:read", "shares:write", "files:read", "files:write"],
    });
    const shareId = `api-v1-files-${randomUUID().slice(0, 8)}`;

    const createShare = await fixture.request
      .post("/api/v1/shares")
      .set("Authorization", context.authorization)
      .send(buildCreateShareDto({ id: shareId }));

    expect(createShare.status).toBe(201);

    const uploadResponse = await fixture.request
      .post(`/api/v1/shares/${shareId}/files/multipart`)
      .set("Authorization", context.authorization)
      .attach("file", Buffer.from("Multipart upload fixture"), "fixture.txt");

    expect(uploadResponse.status).toBe(201);
    expect(uploadResponse.body.name).toBe("fixture.txt");

    const fileResponse = await fixture.request
      .get(`/api/v1/shares/${shareId}/files/${uploadResponse.body.id}`)
      .query({ download: "false" })
      .set("Authorization", context.authorization)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(fileResponse.status).toBe(200);
    expect(fileResponse.headers["content-disposition"]).toContain("inline");
    expect(fileResponse.body.toString()).toBe("Multipart upload fixture");

    const zipResponse = await fixture.request
      .get(`/api/v1/shares/${shareId}/files/zip`)
      .set("Authorization", context.authorization)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(zipResponse.status).toBe(200);
    expect(zipResponse.headers["content-type"]).toBe("application/zip");
    expect(zipResponse.body.subarray(0, 2).toString()).toBe("PK");

    const removeResponse = await fixture.request
      .delete(`/api/v1/shares/${shareId}/files/${uploadResponse.body.id}`)
      .set("Authorization", context.authorization);

    expect(removeResponse.status).toBe(204);

    const shareAfterDelete = await fixture.request
      .get(`/api/v1/shares/${shareId}`)
      .set("Authorization", context.authorization);

    expect(shareAfterDelete.status).toBe(200);
    expect(shareAfterDelete.body.files).toHaveLength(0);
  });

  it("rejects file writes when the API token does not include the write scope", async () => {
    const context = await createApiV1Context(fixture, {
      username: "api-v1-read-only",
      email: "api-v1-read-only@test.local",
      scopes: ["shares:read", "files:read"],
    });
    const share = await seedShare(fixture, {
      id: `api-v1-read-only-${randomUUID().slice(0, 8)}`,
      creatorId: context.user.id,
    });
    const uploadQuery = buildChunkUploadQuery({
      name: "blocked.txt",
    });

    const uploadResponse = await fixture.request
      .post(`/api/v1/shares/${share.id}/files`)
      .query(uploadQuery)
      .set("Authorization", context.authorization)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("should be rejected"));

    expect(uploadResponse.status).toBe(403);
  });
});
