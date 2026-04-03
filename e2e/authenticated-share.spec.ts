import { closeCompletedShareDialog, createInMemoryFile, createShareFromUploadPage } from "./helpers/share";
import { expect, test } from "./fixtures/test";

test("signed-in users can upload, download a ZIP bundle, and delete a file", async ({
  userPage,
  app,
}, testInfo) => {
  const linkId = app.uniqueId("member-share");
  const upload = await createShareFromUploadPage(userPage, {
    files: [
      createInMemoryFile("alpha.txt", "alpha payload"),
      createInMemoryFile("beta.txt", "beta payload"),
    ],
    linkId,
    name: "Authenticated smoke share",
  });

  await closeCompletedShareDialog(upload.completedDialog);
  await userPage.goto(upload.shareLink);
  let zipBuffer: Buffer | undefined;
  await expect
    .poll(
      async () => {
        const response = await userPage.request.get(
          `/api/shares/${upload.shareId}/files/zip`,
        );
        const isReady = response.ok();

        if (isReady) {
          zipBuffer = await response.body();
        }

        await response.dispose();
        return isReady;
      },
      {
        message: `Waiting for public ZIP bundle of ${upload.shareId}`,
        timeout: 60_000,
      },
    )
    .toBe(true);
  await testInfo.attach(`zip-${upload.shareId}`, {
    body: zipBuffer,
    contentType: "application/zip",
  });

  const sharePage = userPage.getByRole("table");
  await expect(sharePage).toContainText("alpha.txt");
  await expect(sharePage).toContainText("beta.txt");

  await userPage.goto(`/share/${upload.shareId}/edit`);
  const alphaRow = userPage.locator("tr", { hasText: "alpha.txt" });
  await alphaRow.getByRole("button", { name: /^delete$/i }).click();
  await userPage.getByRole("button", { name: /^save$/i }).click();

  await expect(userPage).toHaveURL(
    new RegExp(`(?:/s/${upload.shareId}|/share/${upload.shareId})$`),
  );
  await expect(userPage.getByText("alpha.txt")).toHaveCount(0);
  await expect(userPage.getByText("beta.txt")).toBeVisible();
});
