import { closeCompletedShareDialog, createInMemoryFile, createShareFromUploadPage } from "./helpers/share";
import { expect, test } from "./fixtures/test";

test("reverse share links let external users submit a share back to the owner", async ({
  app,
  page,
  userPage,
}) => {
  await userPage.goto("/account/reverseShares");
  await userPage.getByRole("button", { name: /^create$/i }).click();

  const createDialog = userPage.getByRole("dialog", {
    name: /create reverse share/i,
  });
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel(/^max uses$/i).fill("1");
  await createDialog.getByRole("button", { name: /^create$/i }).click();

  const completedDialog = userPage.getByRole("dialog", {
    name: /reverse share link/i,
  });
  await expect(completedDialog).toBeVisible();
  const reverseShareLink = await completedDialog.getByLabel(/^link$/i).inputValue();
  await completedDialog.getByRole("button", { name: /^done$/i }).click();

  const linkId = app.uniqueId("reverse-share");
  const upload = await createShareFromUploadPage(page, {
    files: [createInMemoryFile("reverse-share.txt", "reverse share payload")],
    linkId,
    name: "Reverse share upload",
    path: new URL(reverseShareLink).pathname,
  });

  await closeCompletedShareDialog(upload.completedDialog);
  await userPage.reload();
  await expect(userPage.getByText(/^1 share$/i)).toBeVisible();
  await expect(userPage.getByText(/\b0\b/)).toBeVisible();
});
