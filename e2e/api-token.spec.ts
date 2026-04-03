import { createInMemoryFile } from "./helpers/share";
import { expect, test } from "./fixtures/test";

test("users can create an API token in the UI and use it against /api/v1", async ({
  app,
  playwright,
  userPage,
}) => {
  const tokenName = app.uniqueId("api-token");

  await userPage.goto("/account");
  await userPage.getByLabel(/^token name$/i).fill(tokenName);
  await userPage.getByRole("checkbox", { name: /^shares:read$/ }).check();
  await userPage.getByRole("checkbox", { name: /^shares:write$/ }).check();
  await userPage.getByRole("checkbox", { name: /^files:read$/ }).check();
  await userPage.getByRole("checkbox", { name: /^files:write$/ }).check();
  await userPage.getByRole("button", { name: /^create token$/i }).click();

  const tokenDialog = userPage.getByRole("dialog", { name: /new api token/i });
  await expect(tokenDialog).toBeVisible();
  const apiToken = await tokenDialog.locator("input").inputValue();
  expect(apiToken).toMatch(/^psk_/);

  const apiContext = await playwright.request.newContext({
    baseURL: app.apiURL,
    extraHTTPHeaders: {
      Authorization: `Bearer ${apiToken}`,
    },
  });

  try {
    const shareId = app.uniqueId("api-share");
    const expiration = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const createResponse = await apiContext.post("/api/v1/shares", {
      data: {
        id: shareId,
        name: "API token smoke share",
        expiration,
        recipients: [],
        security: {},
      },
    });
    expect(createResponse.ok()).toBeTruthy();

    const uploadFile = createInMemoryFile("api-token.txt", "api token upload");
    const multipartResponse = await apiContext.post(
      `/api/v1/shares/${shareId}/files/multipart`,
      {
        multipart: {
          file: {
            name: uploadFile.name,
            mimeType: uploadFile.mimeType,
            buffer: uploadFile.buffer,
          },
        },
      },
    );
    expect(multipartResponse.ok()).toBeTruthy();

    const completeResponse = await apiContext.post(
      `/api/v1/shares/${shareId}/complete`,
    );
    expect(completeResponse.ok()).toBeTruthy();

    const listResponse = await apiContext.get("/api/v1/shares");
    expect(listResponse.ok()).toBeTruthy();
    const shares = await listResponse.json();
    expect(shares.some((share: { id: string }) => share.id === shareId)).toBe(
      true,
    );
  } finally {
    await apiContext.dispose();
  }

  await userPage.reload();
  const tokenRow = userPage.locator("tr", { hasText: tokenName });
  await expect(tokenRow).toContainText("Active");
  await expect(tokenRow).not.toContainText("Never");
});
