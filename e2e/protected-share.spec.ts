import { closeCompletedShareDialog, createInMemoryFile, createShareFromUploadPage } from "./helpers/share";
import { expect, test } from "./fixtures/test";

test("password-protected shares unlock in the browser and expose files.json", async ({
  page,
  userPage,
  app,
}) => {
  const password = "secret123";
  const linkId = app.uniqueId("protected-share");
  const upload = await createShareFromUploadPage(userPage, {
    files: [createInMemoryFile("protected.txt", "protected payload")],
    linkId,
    name: "Protected smoke share",
    password,
  });

  await closeCompletedShareDialog(upload.completedDialog);
  await page.goto(upload.shareLink);

  const passwordDialog = page.getByRole("dialog", { name: /password required/i });
  await expect(passwordDialog).toBeVisible();
  await passwordDialog.getByPlaceholder(/^password$/i).fill(password);
  await passwordDialog.getByRole("button", { name: /^submit$/i }).click();

  await expect(page.getByRole("table")).toContainText("protected.txt");

  const filesJsonResponse = await page.request.get(upload.filesJsonLink);
  expect(filesJsonResponse.ok()).toBeTruthy();

  const filesJson = await filesJsonResponse.json();
  expect(filesJson.share.id).toBe(upload.shareId);
  expect(filesJson.share.machineReadableUrl).toBe(upload.filesJsonLink);
  expect(filesJson.files).toHaveLength(1);
  expect(filesJson.files[0].name).toBe("protected.txt");
  expect(filesJson.files[0].downloadUrl).toContain(`/api/shares/${upload.shareId}/files/`);
});
