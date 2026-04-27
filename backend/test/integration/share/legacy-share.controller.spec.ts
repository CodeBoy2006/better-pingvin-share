import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import request from "supertest";
import { binaryResponseParser } from "../../fixtures/file.fixture";
import { seedStoredFile } from "../../fixtures/file.fixture";
import { buildCreateShareDto, seedShare } from "../../fixtures/share.fixture";
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
          `http://localhost:3000/api/shares/${shareId}/file/anonymous-owner.txt`,
          "",
        ].join("\t"),
        "",
      ].join("\n"),
    );
    expect(plainTextListResponse.text).not.toContain(uploadResponse.body.id);

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

    const plainTextDownloadResponse = await publicAgent
      .get(`/api/shares/${shareId}/file/anonymous-owner.txt`)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(plainTextDownloadResponse.status).toBe(200);
    expect(plainTextDownloadResponse.body.toString()).toBe(
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

  it("adds raw-content web-view links for supported files when enabled", async () => {
    await fixture.updateConfig("share.filesJsonWebViewLinksEnabled", true);

    const shareId = `web-view-links-${randomUUID().slice(0, 8)}`;
    const largeTextBytes = Buffer.from(
      `${"A".repeat(5 * 1024 * 1024)}\nstream me too\n`,
      "utf8",
    );
    const imageBytes = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const audioBytes = Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]);
    const videoBytes = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
      0x00, 0x00, 0x00, 0x00,
    ]);
    const pdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "utf8");

    const createResponse = await fixture.request.post("/api/shares").send(
      buildCreateShareDto({
        id: shareId,
      }),
    );

    expect(createResponse.status).toBe(201);

    const ownerCookie = `share_${shareId}_owner_token=${createResponse.body.ownerToken}`;

    const textUploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=guide.md&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("# Guide\n\nCrawler friendly preview."));

    expect(textUploadResponse.status).toBe(201);

    const codeUploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=component.vue&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(
        Buffer.from(
          '<script setup lang="ts">\nconst answer = 42;\n</script>\n',
        ),
      );

    expect(codeUploadResponse.status).toBe(201);

    const sniffedTextUploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=unknown.payload&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("first=value\nsecond=value\n"));

    expect(sniffedTextUploadResponse.status).toBe(201);

    const largeTextUploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=huge.log&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(largeTextBytes);

    expect(largeTextUploadResponse.status).toBe(201);

    const imageUploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=cover.png&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(imageBytes);

    expect(imageUploadResponse.status).toBe(201);

    const audioUploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=theme.mp3&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(audioBytes);

    expect(audioUploadResponse.status).toBe(201);

    const videoUploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=clip.mp4&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(videoBytes);

    expect(videoUploadResponse.status).toBe(201);

    const pdfUploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=manual.pdf&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(pdfBytes);

    expect(pdfUploadResponse.status).toBe(201);

    const binaryUploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=archive.zip&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    expect(binaryUploadResponse.status).toBe(201);

    const completeResponse = await fixture.request
      .post(`/api/shares/${shareId}/complete`)
      .set("Cookie", ownerCookie);

    expect(completeResponse.status).toBe(202);

    const publicAgent = request.agent(fixture.app.getHttpServer());
    const fileListResponse = await publicAgent.get(
      `/api/shares/${shareId}/files.json`,
    );

    expect(fileListResponse.status).toBe(200);

    const supportedFile = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === textUploadResponse.body.id,
    );
    const imageFile = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === imageUploadResponse.body.id,
    );
    const codeFile = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === codeUploadResponse.body.id,
    );
    const sniffedTextFile = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === sniffedTextUploadResponse.body.id,
    );
    const audioFile = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === audioUploadResponse.body.id,
    );
    const largeTextFile = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === largeTextUploadResponse.body.id,
    );
    const videoFile = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === videoUploadResponse.body.id,
    );
    const pdfFile = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === pdfUploadResponse.body.id,
    );
    const unsupportedFile = fileListResponse.body.files.find(
      (file: { id: string }) => file.id === binaryUploadResponse.body.id,
    );

    expect(supportedFile.webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${textUploadResponse.body.id}/web`,
    );
    expect(codeFile.webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${codeUploadResponse.body.id}/web`,
    );
    expect(sniffedTextFile.webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${sniffedTextUploadResponse.body.id}/web`,
    );
    expect(imageFile.webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${imageUploadResponse.body.id}/web`,
    );
    expect(audioFile.webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${audioUploadResponse.body.id}/web`,
    );
    expect(largeTextFile.webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${largeTextUploadResponse.body.id}/web`,
    );
    expect(videoFile.webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${videoUploadResponse.body.id}/web`,
    );
    expect(pdfFile.webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${pdfUploadResponse.body.id}/web`,
    );
    expect(unsupportedFile.webViewUrl).toBeUndefined();

    const webViewUrl = new URL(supportedFile.webViewUrl);
    const webViewResponse = await publicAgent.get(
      `${webViewUrl.pathname}${webViewUrl.search}`,
    );

    expect(webViewResponse.status).toBe(200);
    expect(webViewResponse.headers["content-type"]).toMatch(/^text\/plain\b/);
    expect(webViewResponse.text).toBe("# Guide\n\nCrawler friendly preview.");

    const codeWebViewUrl = new URL(codeFile.webViewUrl);
    const codeWebViewResponse = await publicAgent.get(
      `${codeWebViewUrl.pathname}${codeWebViewUrl.search}`,
    );

    expect(codeWebViewResponse.status).toBe(200);
    expect(codeWebViewResponse.headers["content-type"]).toMatch(
      /^text\/plain\b/,
    );
    expect(codeWebViewResponse.text).toContain("const answer = 42;");

    const sniffedTextWebViewUrl = new URL(sniffedTextFile.webViewUrl);
    const sniffedTextWebViewResponse = await publicAgent.get(
      `${sniffedTextWebViewUrl.pathname}${sniffedTextWebViewUrl.search}`,
    );

    expect(sniffedTextWebViewResponse.status).toBe(200);
    expect(sniffedTextWebViewResponse.headers["content-type"]).toMatch(
      /^text\/plain\b/,
    );
    expect(sniffedTextWebViewResponse.text).toBe("first=value\nsecond=value\n");

    const imageWebViewUrl = new URL(imageFile.webViewUrl);
    const imageWebViewResponse = await publicAgent
      .get(`${imageWebViewUrl.pathname}${imageWebViewUrl.search}`)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(imageWebViewResponse.status).toBe(200);
    expect(imageWebViewResponse.headers["content-type"]).toMatch(
      /^image\/png\b/,
    );
    expect(Buffer.compare(imageWebViewResponse.body, imageBytes)).toBe(0);

    const audioWebViewUrl = new URL(audioFile.webViewUrl);
    const audioWebViewResponse = await publicAgent
      .get(`${audioWebViewUrl.pathname}${audioWebViewUrl.search}`)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(audioWebViewResponse.status).toBe(200);
    expect(audioWebViewResponse.headers["content-type"]).toMatch(
      /^audio\/mpeg\b/,
    );
    expect(Buffer.compare(audioWebViewResponse.body, audioBytes)).toBe(0);

    const largeTextWebViewUrl = new URL(largeTextFile.webViewUrl);
    const largeTextWebViewResponse = await publicAgent.get(
      `${largeTextWebViewUrl.pathname}${largeTextWebViewUrl.search}`,
    );

    expect(largeTextWebViewResponse.status).toBe(200);
    expect(largeTextWebViewResponse.headers["content-type"]).toMatch(
      /^text\/plain\b/,
    );
    expect(largeTextWebViewResponse.text).toContain("stream me too");

    const videoWebViewUrl = new URL(videoFile.webViewUrl);
    const videoWebViewResponse = await publicAgent
      .get(`${videoWebViewUrl.pathname}${videoWebViewUrl.search}`)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(videoWebViewResponse.status).toBe(200);
    expect(videoWebViewResponse.headers["content-type"]).toMatch(
      /^video\/mp4\b/,
    );
    expect(Buffer.compare(videoWebViewResponse.body, videoBytes)).toBe(0);

    const pdfWebViewUrl = new URL(pdfFile.webViewUrl);
    const pdfWebViewResponse = await publicAgent
      .get(`${pdfWebViewUrl.pathname}${pdfWebViewUrl.search}`)
      .buffer(true)
      .parse(binaryResponseParser);

    expect(pdfWebViewResponse.status).toBe(200);
    expect(pdfWebViewResponse.headers["content-type"]).toMatch(
      /^application\/pdf\b/,
    );
    expect(Buffer.compare(pdfWebViewResponse.body, pdfBytes)).toBe(0);

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
      .send(
        Buffer.from("Protected tokenized files.json integration test file"),
      );

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
    expect(fileListResponse.body.files[0].webViewUrl).toBe(
      `http://localhost:3000/api/shares/${shareId}/files/${uploadResponse.body.id}/web?token=${encodeURIComponent(tokenResponse.body.token)}`,
    );

    const plainTextListResponse = await fixture.request
      .get(`/api/shares/${shareId}/files.txt`)
      .set("Cookie", `share_${shareId}_token=${tokenResponse.body.token}`);

    expect(plainTextListResponse.status).toBe(200);
    expect(plainTextListResponse.text).toContain(
      `http://localhost:3000/api/shares/${shareId}/file/protected-tokenized.txt?token=${encodeURIComponent(tokenResponse.body.token)}`,
    );
    expect(plainTextListResponse.text).toContain(
      `http://localhost:3000/api/shares/${shareId}/file/protected-tokenized.txt/web?token=${encodeURIComponent(tokenResponse.body.token)}`,
    );
    expect(plainTextListResponse.text).not.toContain(uploadResponse.body.id);

    const protectedPlainTextListResponse = await fixture.request.get(
      `/api/shares/${shareId}/files.txt`,
    );

    expect(protectedPlainTextListResponse.status).toBe(403);

    const protectedPlainTextDownloadResponse = await fixture.request.get(
      `/api/shares/${shareId}/file/protected-tokenized.txt`,
    );

    expect(protectedPlainTextDownloadResponse.status).toBe(403);

    await fixture.updateConfig(
      "share.filesJsonPasswordProtectedLinksIncludeToken",
      false,
    );
    await fixture.updateConfig("share.filesJsonWebViewLinksEnabled", false);
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

  it("enforces specific IP allow lists even when a valid share token is reused elsewhere", async () => {
    const shareId = `ip-allow-list-${randomUUID().slice(0, 8)}`;

    const createResponse = await fixture.request.post("/api/shares").send(
      buildCreateShareDto({
        id: shareId,
        security: {
          allowedIps: ["198.51.100.10"],
        },
      }),
    );

    expect(createResponse.status).toBe(201);

    const ownerCookie = `share_${shareId}_owner_token=${createResponse.body.ownerToken}`;

    const uploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=restricted.txt&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("Restricted by IP"));

    expect(uploadResponse.status).toBe(201);

    const completeResponse = await fixture.request
      .post(`/api/shares/${shareId}/complete`)
      .set("Cookie", ownerCookie);

    expect(completeResponse.status).toBe(202);

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

    const createResponse = await fixture.request.post("/api/shares").send(
      buildCreateShareDto({
        id: shareId,
        security: {
          maxIps: 2,
        },
      }),
    );

    expect(createResponse.status).toBe(201);

    const ownerCookie = `share_${shareId}_owner_token=${createResponse.body.ownerToken}`;

    const uploadResponse = await fixture.request
      .post(
        `/api/shares/${shareId}/files?name=quota.txt&chunkIndex=0&totalChunks=1`,
      )
      .set("Cookie", ownerCookie)
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("First come first served"));

    expect(uploadResponse.status).toBe(201);

    const completeResponse = await fixture.request
      .post(`/api/shares/${shareId}/complete`)
      .set("Cookie", ownerCookie);

    expect(completeResponse.status).toBe(202);

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
