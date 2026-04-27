import assert from "node:assert/strict";
import { createScenarioHarness, getCookieHeader, serializeError } from "../helpers/http-scenario.mjs";

const apiUrl = process.env.SYSTEM_TEST_API_URL || "http://127.0.0.1:8080/api";
const appUrl = process.env.SYSTEM_TEST_APP_URL || "http://localhost:3000";
const adminEmail = process.env.SYSTEM_TEST_ADMIN_EMAIL || "system@test.org";
const adminPassword = process.env.SYSTEM_TEST_ADMIN_PASSWORD || "J2y8unpJUcJDRv";
const runId = process.env.SYSTEM_TEST_RUN_ID || Date.now().toString();
const resultsDir = process.env.SYSTEM_TEST_STEP_DIR;

if (!resultsDir) {
  throw new Error("SYSTEM_TEST_STEP_DIR is required for scenario artifacts.");
}

const harness = createScenarioHarness({
  scenarioName: "anonymous-owner-flow",
  apiUrl,
  resultsDir,
});

async function main() {
  const signIn = await harness.request("admin sign in", "/auth/signIn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: adminEmail,
      password: adminPassword,
    }),
  });

  assert.equal(signIn.status, 200, "admin sign-in should succeed");
  const adminCookies = getCookieHeader(signIn.response);
  assert.ok(adminCookies.includes("access_token="), "admin access cookie missing");

  const enableAnonymousShares = await harness.request(
    "enable anonymous shares",
    "/configs/admin",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookies,
      },
      body: JSON.stringify([
        {
          key: "share.allowUnauthenticatedShares",
          value: true,
        },
      ]),
    },
  );

  assert.equal(
    enableAnonymousShares.status,
    200,
    "enabling unauthenticated shares should succeed",
  );

  const shareId = `anonymous-owner-${runId}`;
  const createShare = await harness.request("create anonymous share", "/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: shareId,
      expiration: "1-day",
      recipients: [],
      security: {},
    }),
  });

  assert.equal(createShare.status, 201, "anonymous share creation should succeed");
  assert.equal(createShare.json.id, shareId, "unexpected anonymous share id");
  assert.ok(createShare.json.ownerToken, "owner token should be returned");
  assert.ok(
    createShare.json.ownerManagementLink.includes(
      `/share/${shareId}/edit#ownerToken=`,
    ),
    "owner management link should embed the capability token in the URL fragment",
  );

  const ownerCookie = `share_${shareId}_owner_token=${createShare.json.ownerToken}`;

  const ownerPayloadWithoutToken = await harness.request(
    "owner payload without token",
    `/shares/${shareId}/from-owner`,
  );
  assert.equal(
    ownerPayloadWithoutToken.status,
    403,
    "anonymous owner payload should be forbidden without the owner token",
  );

  const uploadFile = await harness.request(
    "upload anonymous owner file",
    `/shares/${shareId}/files?name=anonymous-owner.txt&chunkIndex=0&totalChunks=1`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        Cookie: ownerCookie,
      },
      body: Buffer.from("Anonymous owner system test file."),
    },
  );

  assert.equal(uploadFile.status, 201, "anonymous owner upload should succeed");
  assert.equal(uploadFile.json.name, "anonymous-owner.txt");

  const ownerPayloadWithToken = await harness.request(
    "owner payload with token",
    `/shares/${shareId}/from-owner`,
    {
      headers: {
        Cookie: ownerCookie,
      },
    },
  );

  assert.equal(
    ownerPayloadWithToken.status,
    200,
    "anonymous owner payload should load with the owner token",
  );
  assert.equal(ownerPayloadWithToken.json.id, shareId);
  assert.equal(ownerPayloadWithToken.json.files.length, 1);
  assert.equal(ownerPayloadWithToken.json.files[0].name, "anonymous-owner.txt");

  const completeShare = await harness.request(
    "complete anonymous share",
    `/shares/${shareId}/complete`,
    {
      method: "POST",
      headers: {
        Cookie: ownerCookie,
      },
    },
  );

  assert.equal(
    completeShare.status,
    202,
    "anonymous owner should be able to complete the share",
  );
  assert.ok(
    completeShare.json.ownerToken,
    "owner token should still be returned after completion",
  );
  assert.ok(
    completeShare.json.ownerManagementLink.includes(
      `/share/${shareId}/edit#ownerToken=`,
    ),
    "completed share should still expose the owner management link",
  );

  const machineReadableList = await harness.request(
    "machine readable share listing",
    `/shares/${shareId}/files.json`,
  );
  assert.equal(machineReadableList.status, 200, "machine-readable share listing should be public");
  assert.match(
    machineReadableList.headers.get("content-type") || "",
    /^application\/json\b/,
    "machine-readable listing should use JSON",
  );
  assert.equal(
    machineReadableList.json.type,
    "pingvin-share-file-list",
    "unexpected machine-readable listing type",
  );
  assert.equal(machineReadableList.json.version, 1, "unexpected machine-readable listing version");
  assert.equal(machineReadableList.json.share.id, shareId);
  assert.equal(machineReadableList.json.share.totalFiles, 1);
  assert.equal(
    machineReadableList.json.share.machineReadableUrl,
    `${appUrl}/s/${shareId}/files.json`,
    "machine-readable URL should point to the share alias",
  );
  assert.equal(
    machineReadableList.json.share.plainTextUrl,
    `${appUrl}/s/${shareId}/files.txt`,
    "plain-text URL should point to the share alias",
  );
  assert.equal(machineReadableList.json.files.length, 1);
  assert.equal(machineReadableList.json.files[0].name, "anonymous-owner.txt");
  assert.equal(
    machineReadableList.json.files[0].downloadUrl,
    `${appUrl}/api/shares/${shareId}/files/${uploadFile.json.id}`,
    "download URL should stay stable without an embedded share token",
  );

  const shareTokenCookie = getCookieHeader(machineReadableList.response);
  assert.match(
    shareTokenCookie,
    new RegExp(`share_${shareId}_token=`),
    "machine-readable listing should refresh the share token cookie",
  );

  const backendOrigin = apiUrl.replace(/\/api$/, "");
  const downloadUrl = new URL(machineReadableList.json.files[0].downloadUrl);
  const directDownload = await harness.request(
    "direct file download",
    `${backendOrigin}${downloadUrl.pathname}${downloadUrl.search}`,
    {
      headers: {
        Cookie: shareTokenCookie,
      },
    },
  );

  assert.equal(
    directDownload.status,
    200,
    "direct link from machine-readable listing should download",
  );
  assert.equal(
    directDownload.text,
    "Anonymous owner system test file.",
    "direct link should return the uploaded file contents",
  );

  const deleteShare = await harness.request("delete anonymous share", `/shares/${shareId}`, {
    method: "DELETE",
    headers: {
      Cookie: ownerCookie,
    },
  });

  assert.equal(deleteShare.status, 200, "anonymous owner should be able to delete the share");

  const deletedOwnerPayload = await harness.request(
    "deleted owner payload",
    `/shares/${shareId}/from-owner`,
    {
      headers: {
        Cookie: ownerCookie,
      },
    },
  );

  assert.equal(
    deletedOwnerPayload.status,
    404,
    "deleted anonymous shares should no longer expose an owner payload",
  );

  harness.finalize({
    status: "passed",
    metadata: {
      shareId,
      requestCount: 10,
    },
  });
}

main().catch((error) => {
  harness.finalize({
    status: "failed",
    metadata: {
      shareId: `anonymous-owner-${runId}`,
    },
    error: serializeError(error),
  });
  console.error("Anonymous owner flow regression failed.");
  console.error(error);
  process.exit(1);
});
