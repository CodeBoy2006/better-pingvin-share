import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "../fixtures/test";

type UploadFile = {
  buffer: Buffer;
  mimeType: string;
  name: string;
};

type CreateShareOptions = {
  files: UploadFile[];
  linkId: string;
  name?: string;
  password?: string;
  path?: string;
};

export type CompletedShareResult = {
  completedDialog: Locator;
  filesJsonLink: string;
  ownerManagementLink?: string;
  shareId: string;
  shareLink: string;
};

export const createInMemoryFile = (
  name: string,
  body: string,
  mimeType = "text/plain",
): UploadFile => ({
  buffer: Buffer.from(body, "utf8"),
  mimeType,
  name,
});

const parseShareIdFromShareLink = (shareLink: string) => {
  const pathnameSegments = new URL(shareLink).pathname
    .split("/")
    .filter(Boolean);
  const shareId = pathnameSegments[pathnameSegments.length - 1];

  if (!shareId) {
    throw new Error(`Unable to parse a share ID from ${shareLink}`);
  }

  return shareId;
};

export const closeCompletedShareDialog = async (dialog: Locator) => {
  await dialog.getByRole("button", { name: /^done$/i }).click();
  await expect(dialog).toBeHidden();
};

export const createShareFromUploadPage = async (
  page: Page,
  options: CreateShareOptions,
): Promise<CompletedShareResult> => {
  await page.goto(options.path ?? "/upload");
  const fileInput = page.locator('input[type="file"]').first();
  await expect(fileInput).toBeAttached();
  await fileInput.setInputFiles(options.files);
  await expect(page.getByRole("table")).toContainText(options.files[0].name);

  await page.getByRole("button", { name: /^share$/i }).click();

  const createDialog = page.getByRole("dialog", { name: /create share/i });
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel(/^link$/i).fill(options.linkId);

  if (options.name) {
    await createDialog
      .getByRole("button", { name: /name and description/i })
      .click();
    await createDialog.getByPlaceholder(/^name$/i).fill(options.name);
  }

  if (options.password) {
    await createDialog.getByRole("button", { name: /security options/i }).click();
    await createDialog
      .getByLabel(/^password protection$/i)
      .fill(options.password);
  }

  await createDialog.getByRole("button", { name: /^share$/i }).last().click();

  const completedDialog = page.getByRole("dialog", { name: /share ready/i });
  await expect(completedDialog).toBeVisible({ timeout: 60_000 });

  const shareLink = await completedDialog.getByLabel(/share link/i).inputValue();
  const filesJsonLink = await completedDialog
    .getByLabel(/^files\.json$/i)
    .inputValue();
  const ownerLinkField = completedDialog.getByLabel(/^link$/i);
  const ownerManagementLink =
    (await ownerLinkField.count()) > 0
      ? await ownerLinkField.last().inputValue()
      : undefined;

  return {
    completedDialog,
    filesJsonLink,
    ownerManagementLink,
    shareId: parseShareIdFromShareLink(shareLink),
    shareLink,
  };
};

export const waitForZipReady = async (
  api: APIRequestContext,
  shareId: string,
) => {
  await expect
    .poll(
      async () => {
        const response = await api.get(`/api/shares/${shareId}/metaData`);

        if (!response.ok()) {
          return false;
        }

        const payload = await response.json();
        return payload.isZipReady;
      },
      {
        message: `Waiting for ZIP bundle to be generated for ${shareId}`,
        timeout: 60_000,
      },
    )
    .toBe(true);
};
