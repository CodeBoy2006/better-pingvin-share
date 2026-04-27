import { closeCompletedShareDialog, createInMemoryFile, createShareFromUploadPage } from "./helpers/share";
import { expect, test } from "./fixtures/test";

test("signed-in users can upload, view, and delete a file", async ({
  userPage,
  app,
}) => {
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
  const sharePage = userPage.getByRole("table");
  await expect(sharePage).toContainText("alpha.txt");
  await expect(sharePage).toContainText("beta.txt");

  await userPage.goto(`/share/${upload.shareId}/edit`);
  const alphaRow = userPage.locator("tr", { hasText: "alpha.txt" });
  await alphaRow.getByRole("button", { name: /^delete$/i }).click();
  await userPage.getByRole("button", { name: /^save files$/i }).click();

  await expect(userPage).toHaveURL(
    new RegExp(`(?:/s/${upload.shareId}|/share/${upload.shareId})$`),
  );
  await expect(userPage.getByText("alpha.txt")).toHaveCount(0);
  await expect(userPage.getByText("beta.txt")).toBeVisible();
});
