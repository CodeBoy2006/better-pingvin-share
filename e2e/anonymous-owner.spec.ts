import { configureSmokeDefaults } from "./helpers/config";
import { closeCompletedShareDialog, createInMemoryFile, createShareFromUploadPage } from "./helpers/share";
import { expect, test } from "./fixtures/test";

test("anonymous uploader receives an owner link and can inspect the edit page", async ({
  adminApi,
  page,
  app,
}) => {
  await configureSmokeDefaults(adminApi, {
    allowUnauthenticatedShares: true,
    baseURL: app.baseURL,
  });

  const linkId = app.uniqueId("anon-share");
  const upload = await createShareFromUploadPage(page, {
    files: [createInMemoryFile("anonymous-note.txt", "anonymous owner flow")],
    linkId,
    name: "Anonymous smoke share",
  });

  expect(upload.ownerManagementLink).toBeTruthy();
  expect(upload.ownerManagementLink).toContain(`/share/${upload.shareId}/edit#ownerToken=`);
  expect(upload.filesJsonLink).toContain(`/s/${upload.shareId}/files.json`);
  await closeCompletedShareDialog(upload.completedDialog);

  await page.goto(upload.shareLink);
  await expect(page.getByRole("table")).toContainText("anonymous-note.txt");

  await page.goto(upload.ownerManagementLink!);
  await expect(page).toHaveURL(new RegExp(`/share/${upload.shareId}/edit$`));
  await expect(page.getByRole("button", { name: /^save$/i })).toBeVisible();
  await expect(page.getByText("anonymous-note.txt")).toBeVisible();
});
