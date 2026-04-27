import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import {
  binaryResponseParser,
  seedStoredFile,
} from "../../fixtures/file.fixture";
import { buildCreateShareDto, seedShare } from "../../fixtures/share.fixture";
import { createIntegrationApp } from "../../fixtures/test-app.fixture";

describe("Legacy share endpoints", () => {
  let fixture: Awaited<ReturnType<typeof createIntegrationApp>>;

  beforeAll(async () => {
    fixture = await createIntegrationApp();
    await fixture.updateConfig("share.allowUnauthenticatedShares", true);
  }, 30_000);

  afterAll(async () => {
    if (fixture) {
      await fixture.close();
    }
  });

  it("supports the anonymous owner flow, files.json, and owner-token protected uploads", async () => {
    const shareId = `anonymous-owner-${randomUUID().slice(0, 8)}`;

    const createResponse = await fixture.request.post("/api/shares").send(
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
          plainTextUrl: `http://localhost:3000/s/${shareId}/files.txt`,
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
    expect(fileListResponse.body.files[0].webViewUrl).toBeUndefined();
    expect(fileListResponse.headers["set-cookie"]).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`share_${shareId}_token=`),
      ]),
    );

    const plainTextListResponse = await publicAgent.get(
      `/api/shares/${shareId}/files.txt`,
    );

    expect(plainTextListResponse.status).toBe(200);
    expect(plainTextListResponse.headers["content-type"]).toMatch(
      /^text\/plain\b/,
    );
    expect(plainTextListResponse.text).toBe(
      [
        "Pingvin Share File List",
        `Share: ${shareId}`,
        `URL: http://localhost:3000/s/${shareId}`,
        "Files: 1",
        `Total size: ${fileListResponse.body.share.totalSizeBytes} bytes`,
        "",
        [
          "anonymous-owner.txt",
          "text/plain",
          `${fileListResponse.body.files[0].sizeBytes} bytes`,
          `http://localhost:3000/api/shares/${shareId}/files/${uploadResponse.body.id}`,
          "",
        ].join("\t"),
        "",
      ].join("\n"),
    );

    const removedFileNameRouteResponse = await publicAgent.get(
      `/api/shares/${shareId}/file/anonymous-owner.txt`,
    );

    expect(removedFileNameRouteResponse.status).toBe(404);

    const downloadUrl = new URL(fileListResponse.body.files[0].downloadUrl);
    const downloadResponse = await publicAgent
      .get(`${downloadUrl.pathname}${downloadUrl.search}`)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.body.toString()).toBe(
      "Anonymous owner integration test file",
    );
    expect(downloadResponse.headers["cache-control"]).toContain("no-store");

    const deleteResponse = await fixture.request
      .delete(`/api/shares/${shareId}`)
      .set("Cookie", ownerCookie);

    expect(deleteResponse.status).toBe(200);

    const deletedOwnerPayload = await fixture.request
      .get(`/api/shares/${shareId}/from-owner`)
      .set("Cookie", ownerCookie);

    expect(deletedOwnerPayload.status).toBe(404);
  });

  it("does not let admin access bypass expiration for retained shares", async () => {
    await fixture.updateConfig("share.allowAdminAccessAllShares", true);
    await fixture.updateConfig("share.fileRetentionPeriod", "7 days");

    const owner = await fixture.createUser();
    const admin = await fixture.createSession({ isAdmin: true });
    const shareId = `expired-admin-${randomUUID().slice(0, 8)}`;
    const share = await seedShare(fixture, {
      id: shareId,
      creatorId: owner.user.id,
      uploadLocked: true,
      expiration: new Date("2000-01-01T00:00:00.000Z"),
    });
    const file = await seedStoredFile(fixture, {
      shareId: share.id,
      name: "retained.txt",
      contents: "retained but expired",
    });

    const shareResponse = await admin.agent.get(`/api/shares/${share.id}`);
    expect(shareResponse.status).toBe(404);

    const fileListResponse = await admin.agent.get(
      `/api/shares/${share.id}/files.json`,
    );
    expect(fileListResponse.status).toBe(404);

    const downloadResponse = await admin.agent
      .get(`/api/shares/${share.id}/files/${file.id}`)
      .buffer(true)
      .parse(binaryResponseParser);
    expect(downloadResponse.status).toBe(404);

    const auditResponse = await admin.agent.get(
      `/api/shares/${share.id}/audit`,
    );
    expect(auditResponse.status).toBe(200);
    expect(auditResponse.headers["cache-control"]).toContain("no-store");
    expect(auditResponse.body).toEqual(
      expect.objectContaining({
        id: share.id,
        files: [
          expect.objectContaining({
            id: file.id,
            name: "retained.txt",
          }),
        ],
      }),
    );

    const auditDownloadResponse = await admin.agent
      .get(`/api/shares/${share.id}/audit/files/${file.id}`)
      .buffer(true)
      .parse(binaryResponseParser);
    expect(auditDownloadResponse.status).toBe(200);
    expect(auditDownloadResponse.headers["cache-control"]).toContain(
      "no-store",
    );
    expect(auditDownloadResponse.body.toString()).toBe("retained but expired");

    const unauthenticatedAuditResponse = await fixture.request.get(
      `/api/shares/${share.id}/audit`,
    );
    expect(unauthenticatedAuditResponse.status).toBe(403);

    await fixture.updateConfig("share.allowAdminAccessAllShares", false);
    await fixture.updateConfig("share.fileRetentionPeriod", "0 days");
  });

  it("lets owners recover expired retained shares before file deletion", async () => {
    await fixture.updateConfig("share.fileRetentionPeriod", "7 days");
    await fixture.updateConfig("share.expiredEditablePeriod", "7 days");

    const owner = await fixture.createSession();
    const shareId = `recover-expired-${randomUUID().slice(0, 8)}`;
    const share = await seedShare(fixture, {
      id: shareId,
      creatorId: owner.user.id,
      uploadLocked: true,
      expiration: new Date(Date.now() - 24 * 60 * 60 * 1000),
      security: {
        password: "old-password",
        maxIps: 1,
        assignedIps: ["198.51.100.7"],
      },
    });
    await seedStoredFile(fixture, {
      shareId: share.id,
      name: "recoverable.txt",
      contents: "recoverable file",
    });

    const publicExpiredResponse = await fixture.request.get(
      `/api/shares/${share.id}`,
    );
    expect(publicExpiredResponse.status).toBe(404);

    const recoveredExpiration = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const updateResponse = await owner.agent.patch(`/api/shares/${share.id}`).send({
      expiration: recoveredExpiration.toISOString(),
      name: "Recovered share",
      description: "Recovered before deletion",
      recipients: ["recipient@example.com"],
      security: {
        password: "",
        maxViews: 5,
        allowedIps: ["127.0.0.1"],
      },
    });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body).toEqual(
      expect.objectContaining({
        id: share.id,
        name: "Recovered share",
        description: "Recovered before deletion",
        recipients: ["recipient@example.com"],
        security: expect.objectContaining({
          passwordProtected: false,
          maxViews: 5,
          maxIps: null,
          allowedIps: ["127.0.0.1"],
          assignedIps: [],
        }),
      }),
    );

    const recoveredPublicResponse = await fixture.request.get(
      `/api/shares/${share.id}`,
    );
    expect(recoveredPublicResponse.status).toBe(200);

    await fixture.updateConfig("share.expiredEditablePeriod", "0 days");
    await fixture.updateConfig("share.fileRetentionPeriod", "0 days");
  });

  it("rejects expired editable periods beyond file retention", async () => {
    await fixture.updateConfig("share.expiredEditablePeriod", "0 days");
    await fixture.updateConfig("share.fileRetentionPeriod", "1 days");

    await expect(
      fixture.updateConfig("share.expiredEditablePeriod", "2 days"),
    ).rejects.toThrow();

    await fixture.updateConfig("share.fileRetentionPeriod", "0 days");
  });

  it("refreshes the share cookie for files.json token queries and returns clean URLs", async () => {
    const shareId = `protected-files-json-${randomUUID().slice(0, 8)}`;
    const password = "secret123";
    await seedShare(fixture, {
      id: shareId,
      uploadLocked: true,
      security: { password },
    });
    const file = await seedStoredFile(fixture, {
      shareId,
      name: "protected-files-json.txt",
      contents: "Protected files.json integration test file",
    });

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
      `http://localhost:3000/api/shares/${shareId}/files/${file.id}`,
    );
    expect(fileListResponse.body.files[0].inlineUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${file.id}?download=false`,
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

  it("adds raw-content web-view links for supported files when enabled", async () => {
    await fixture.updateConfig("share.filesJsonWebViewLinksEnabled", true);

    const shareId = `web-view-links-${randomUUID().slice(0, 8)}`;
    const imageBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    await seedShare(fixture, {
      id: shareId,
      uploadLocked: true,
    });
    const textFile = await seedStoredFile(fixture, {
      shareId,
      name: "guide.md",
      contents: "# Guide\n\nCrawler friendly preview.",
    });
    const imageFile = await seedStoredFile(fixture, {
      shareId,
      name: "cover.png",
      contents: imageBytes,
    });
    const unsupportedFile = await seedStoredFile(fixture, {
      shareId,
      name: "archive.zip",
      contents: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    });

    const publicAgent = request.agent(fixture.app.getHttpServer());
    const fileListResponse = await publicAgent.get(
      `/api/shares/${shareId}/files.json`,
    );

    expect(fileListResponse.status).toBe(200);

    const textFileEntry = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === textFile.id,
    );
    const imageFileEntry = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === imageFile.id,
    );
    const unsupportedFileEntry = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === unsupportedFile.id,
    );

    expect(textFileEntry.webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${textFile.id}/web`,
    );
    expect(imageFileEntry.webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${imageFile.id}/web`,
    );
    expect(unsupportedFileEntry.webViewUrl).toBeUndefined();

    const webViewUrl = new URL(textFileEntry.webViewUrl);
    const webViewResponse = await publicAgent.get(
      `${webViewUrl.pathname}${webViewUrl.search}`,
    );

    expect(webViewResponse.status).toBe(200);
    expect(webViewResponse.headers["content-type"]).toMatch(/^text\/plain\b/);
    expect(webViewResponse.text).toBe("# Guide\n\nCrawler friendly preview.");

    const imageWebViewUrl = new URL(imageFileEntry.webViewUrl);
    const imageWebViewResponse = await publicAgent
      .get(`${imageWebViewUrl.pathname}${imageWebViewUrl.search}`)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(imageWebViewResponse.status).toBe(200);
    expect(imageWebViewResponse.headers["content-type"]).toMatch(
      /^image\/png\b/,
    );
    expect(Buffer.compare(imageWebViewResponse.body, imageBytes)).toBe(0);

    await fixture.updateConfig("share.filesJsonWebViewLinksEnabled", false);
  });

  it("can return tokenized files.json URLs for password-protected shares when enabled", async () => {
    await fixture.updateConfig(
      "share.filesJsonPasswordProtectedLinksIncludeToken",
      true,
    );
    await fixture.updateConfig("share.filesJsonWebViewLinksEnabled", true);

    const shareId = `protected-tokenized-${randomUUID().slice(0, 8)}`;
    const password = "secret123";
    await seedShare(fixture, {
      id: shareId,
      uploadLocked: true,
      security: { password },
    });
    const file = await seedStoredFile(fixture, {
      shareId,
      name: "protected-tokenized.txt",
      contents: "Protected tokenized files.json integration test file",
    });

    const tokenResponse = await fixture.request
      .post(`/api/shares/${shareId}/token`)
      .send({ password });

    expect(tokenResponse.status).toBe(200);

    const fileListResponse = await fixture.request
      .get(`/api/shares/${shareId}/files.json`)
      .set("Cookie", `share_${shareId}_token=${tokenResponse.body.token}`);

    expect(fileListResponse.status).toBe(200);
    expect(fileListResponse.body.files[0].downloadUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${file.id}?token=${encodeURIComponent(tokenResponse.body.token)}`,
    );
    expect(fileListResponse.body.files[0].inlineUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${file.id}?download=false&token=${encodeURIComponent(tokenResponse.body.token)}`,
    );
    expect(fileListResponse.body.files[0].webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${file.id}/web?token=${encodeURIComponent(tokenResponse.body.token)}`,
    );

    const plainTextListResponse = await fixture.request
      .get(`/api/shares/${shareId}/files.txt`)
      .set("Cookie", `share_${shareId}_token=${tokenResponse.body.token}`);

    expect(plainTextListResponse.status).toBe(200);
    expect(plainTextListResponse.text).toContain(
      `http://localhost:3000/api/shares/${shareId}/files/${file.id}?token=${encodeURIComponent(tokenResponse.body.token)}`,
    );
    expect(plainTextListResponse.text).toContain(
      `http://localhost:3000/api/shares/${shareId}/files/${file.id}/web?token=${encodeURIComponent(tokenResponse.body.token)}`,
    );

    const protectedPlainTextListResponse = await fixture.request.get(
      `/api/shares/${shareId}/files.txt`,
    );

    expect(protectedPlainTextListResponse.status).toBe(403);

    await fixture.updateConfig(
      "share.filesJsonPasswordProtectedLinksIncludeToken",
      false,
    );
    await fixture.updateConfig("share.filesJsonWebViewLinksEnabled", false);
  });

  it("enforces specific IP allow lists even when a valid share token is reused elsewhere", async () => {
    const shareId = `ip-allow-list-${randomUUID().slice(0, 8)}`;
    await seedShare(fixture, {
      id: shareId,
      uploadLocked: true,
      security: {
        allowedIps: ["198.51.100.10"],
      },
    });
    await seedStoredFile(fixture, {
      shareId,
      name: "restricted.txt",
      contents: "Restricted by IP",
    });

    const tokenResponse = await fixture.request
      .post(`/api/shares/${shareId}/token`)
      .set("X-Forwarded-For", "198.51.100.10")
      .send({});

    expect(tokenResponse.status).toBe(200);

    const allowedResponse = await fixture.request
      .get(`/api/shares/${shareId}/files.json`)
      .set("X-Forwarded-For", "198.51.100.10");

    expect(allowedResponse.status).toBe(200);

    const deniedResponse = await fixture.request
      .get(`/api/shares/${shareId}`)
      .query({ token: tokenResponse.body.token })
      .set("X-Forwarded-For", "198.51.100.20");

    expect(deniedResponse.status).toBe(403);
    expect(deniedResponse.body.error).toBe("share_ip_not_allowed");
  });

  it("assigns the first allowed IPs and rejects new ones after the quota is reached", async () => {
    const shareId = `ip-quota-${randomUUID().slice(0, 8)}`;
    await seedShare(fixture, {
      id: shareId,
      uploadLocked: true,
      security: {
        maxIps: 2,
      },
    });
    await seedStoredFile(fixture, {
      shareId,
      name: "quota.txt",
      contents: "First come first served",
    });

    const firstResponse = await fixture.request
      .get(`/api/shares/${shareId}/files.json`)
      .set("X-Forwarded-For", "198.51.100.10");

    expect(firstResponse.status).toBe(200);

    const secondResponse = await fixture.request
      .get(`/api/shares/${shareId}/files.json`)
      .set("X-Forwarded-For", "198.51.100.11");

    expect(secondResponse.status).toBe(200);

    const deniedResponse = await fixture.request
      .get(`/api/shares/${shareId}/files.json`)
      .set("X-Forwarded-For", "198.51.100.12");

    expect(deniedResponse.status).toBe(403);
    expect(deniedResponse.body.error).toBe("share_ip_limit_exceeded");

    const storedShare = await fixture.prisma.share.findUnique({
      where: { id: shareId },
      include: {
        security: {
          include: {
            assignedIps: {
              orderBy: {
                ipAddress: "asc",
              },
            },
          },
        },
      },
    });

    expect(storedShare.security.assignedIps).toEqual([
      expect.objectContaining({ ipAddress: "198.51.100.10" }),
      expect.objectContaining({ ipAddress: "198.51.100.11" }),
    ]);
  });
});
