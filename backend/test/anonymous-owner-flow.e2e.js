const assert = require("node:assert/strict");

const API_URL = process.env.SYSTEM_TEST_API_URL || "http://localhost:8080/api";
const ADMIN_EMAIL = "system@test.org";
const ADMIN_PASSWORD = "J2y8unpJUcJDRv";

function getCookieHeader(response) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  return setCookies
    .map((cookie) => cookie.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, options);
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  let json;
  if (contentType.includes("application/json") && text.length > 0) {
    json = JSON.parse(text);
  }

  return {
    response,
    status: response.status,
    headers: response.headers,
    text,
    json,
  };
}

async function main() {
  const signIn = await request("/auth/signIn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    }),
  });

  assert.equal(signIn.status, 200, "admin sign-in should succeed");
  const adminCookies = getCookieHeader(signIn.response);
  assert.ok(adminCookies.includes("access_token="), "admin access cookie missing");

  const enableAnonymousShares = await request("/configs/admin", {
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
  });

  assert.equal(
    enableAnonymousShares.status,
    200,
    "enabling unauthenticated shares should succeed",
  );

  const shareId = `anonymous-owner-e2e-${Date.now()}`;
  const createShare = await request("/shares", {
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

  const ownerPayloadWithoutToken = await request(`/shares/${shareId}/from-owner`);
  assert.equal(
    ownerPayloadWithoutToken.status,
    403,
    "anonymous owner payload should be forbidden without the owner token",
  );

  const uploadFile = await request(
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

  const ownerPayloadWithToken = await request(`/shares/${shareId}/from-owner`, {
    headers: {
      Cookie: ownerCookie,
    },
  });

  assert.equal(
    ownerPayloadWithToken.status,
    200,
    "anonymous owner payload should load with the owner token",
  );
  assert.equal(ownerPayloadWithToken.json.id, shareId);
  assert.equal(ownerPayloadWithToken.json.files.length, 1);
  assert.equal(ownerPayloadWithToken.json.files[0].name, "anonymous-owner.txt");

  const completeShare = await request(`/shares/${shareId}/complete`, {
    method: "POST",
    headers: {
      Cookie: ownerCookie,
    },
  });

  assert.equal(completeShare.status, 202, "anonymous owner should be able to complete the share");
  assert.ok(completeShare.json.ownerToken, "owner token should still be returned after completion");
  assert.ok(
    completeShare.json.ownerManagementLink.includes(
      `/share/${shareId}/edit#ownerToken=`,
    ),
    "completed share should still expose the owner management link",
  );

  const deleteShare = await request(`/shares/${shareId}`, {
    method: "DELETE",
    headers: {
      Cookie: ownerCookie,
    },
  });

  assert.equal(deleteShare.status, 200, "anonymous owner should be able to delete the share");

  const deletedOwnerPayload = await request(`/shares/${shareId}/from-owner`, {
    headers: {
      Cookie: ownerCookie,
    },
  });

  assert.equal(
    deletedOwnerPayload.status,
    404,
    "deleted anonymous shares should no longer expose an owner payload",
  );

  console.log("Anonymous owner flow regression passed.");
}

main().catch((error) => {
  console.error("Anonymous owner flow regression failed.");
  console.error(error);
  process.exit(1);
});
