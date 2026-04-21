import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAxiosResponse } from "../../network";

const apiMock = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));
const deleteCookieMock = vi.hoisted(() => vi.fn());
const setCookieMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/services/api.service", () => ({
  default: apiMock,
}));
vi.mock("cookies-next", () => ({
  deleteCookie: deleteCookieMock,
  setCookie: setCookieMock,
}));

import shareService from "../../../src/services/share.service";

describe("share.service", () => {
  const originalLocation = window.location;

  const mockWindowLocation = () => {
    const location = {
      href: "http://localhost/",
      origin: "http://localhost",
    } as unknown as Location;

    Object.defineProperty(window, "location", {
      configurable: true,
      value: location,
    });

    return location;
  };

  beforeEach(() => {
    apiMock.delete.mockReset();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
    deleteCookieMock.mockReset();
    setCookieMock.mockReset();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("loads share lists and storage stats", async () => {
    apiMock.get
      .mockResolvedValueOnce(createAxiosResponse([{ id: "share-1" }]))
      .mockResolvedValueOnce(
        createAxiosResponse({
          disk: null,
          shareCount: 1,
          storageProvider: "LOCAL",
          totalShareSizeBytes: 1024,
        }),
      )
      .mockResolvedValueOnce(
        createAxiosResponse({
          files: [{ id: "file-1", name: "retained.txt", size: "8" }],
          id: "share-1",
        }),
      )
      .mockResolvedValueOnce(createAxiosResponse([{ id: "mine-1" }]));

    await expect(shareService.list()).resolves.toEqual([{ id: "share-1" }]);
    await expect(shareService.getStorageStats()).resolves.toEqual({
      disk: null,
      shareCount: 1,
      storageProvider: "LOCAL",
      totalShareSizeBytes: 1024,
    });
    await expect(shareService.getAdminAuditShare("share-1")).resolves.toEqual({
      files: [{ id: "file-1", name: "retained.txt", size: "8" }],
      id: "share-1",
    });
    await expect(shareService.getMyShares()).resolves.toEqual([
      { id: "mine-1" },
    ]);

    expect(apiMock.get).toHaveBeenNthCalledWith(1, "shares/all");
    expect(apiMock.get).toHaveBeenNthCalledWith(2, "shares/stats/storage");
    expect(apiMock.get).toHaveBeenNthCalledWith(3, "shares/share-1/audit");
    expect(apiMock.get).toHaveBeenNthCalledWith(4, "shares");
  });

  it("creates shares and persists owner tokens for non-reverse shares", async () => {
    const createdShare = {
      id: "share-1",
      ownerToken: "owner-token",
    };
    apiMock.post.mockResolvedValue(createAxiosResponse(createdShare));

    await expect(
      shareService.create(
        {
          description: "Documents",
          expiration: "7 days",
          id: "share-1",
          recipients: [],
          security: {},
        },
        false,
      ),
    ).resolves.toEqual(createdShare);

    expect(deleteCookieMock).toHaveBeenCalledWith("reverse_share_token");
    expect(apiMock.post).toHaveBeenCalledWith("shares", {
      description: "Documents",
      expiration: "7 days",
      id: "share-1",
      recipients: [],
      security: {},
    });
    expect(setCookieMock).toHaveBeenCalledWith(
      "share_share-1_owner_token",
      "owner-token",
      {
        path: "/",
        sameSite: "lax",
      },
    );
  });

  it("does not clear the reverse-share cookie when creating reverse-share uploads", async () => {
    apiMock.post.mockResolvedValue(createAxiosResponse({ id: "share-1" }));

    await shareService.create(
      {
        expiration: "7 days",
        id: "share-1",
        recipients: [],
        security: {},
      },
      true,
    );

    expect(deleteCookieMock).not.toHaveBeenCalled();
  });

  it("completes shares, reverts completion, and deletes shares", async () => {
    apiMock.post.mockResolvedValue(
      createAxiosResponse({
        id: "share-1",
        ownerToken: "completed-owner-token",
      }),
    );
    apiMock.delete.mockResolvedValue(createAxiosResponse({ ok: true }));

    await expect(shareService.completeShare("share-1")).resolves.toEqual({
      id: "share-1",
      ownerToken: "completed-owner-token",
    });
    await shareService.revertComplete("share-1");
    await shareService.remove("share-1");

    expect(deleteCookieMock).toHaveBeenCalledWith("reverse_share_token");
    expect(setCookieMock).toHaveBeenCalledWith(
      "share_share-1_owner_token",
      "completed-owner-token",
      {
        path: "/",
        sameSite: "lax",
      },
    );
    expect(apiMock.delete).toHaveBeenNthCalledWith(
      1,
      "shares/share-1/complete",
    );
    expect(apiMock.delete).toHaveBeenNthCalledWith(2, "shares/share-1");
    expect(deleteCookieMock).toHaveBeenCalledWith("share_share-1_owner_token", {
      path: "/",
    });
  });

  it("loads share details, metadata, and share tokens", async () => {
    apiMock.get
      .mockResolvedValueOnce(createAxiosResponse({ id: "share-1" }))
      .mockResolvedValueOnce(
        createAxiosResponse({ id: "share-1", owner: true }),
      )
      .mockResolvedValueOnce(
        createAxiosResponse({ id: "share-1", isZipReady: true }),
      )
      .mockResolvedValueOnce(createAxiosResponse({ isAvailable: true }));
    apiMock.post.mockResolvedValue(createAxiosResponse({}));

    await expect(shareService.get("share-1")).resolves.toEqual({
      id: "share-1",
    });
    await expect(shareService.getFromOwner("share-1")).resolves.toEqual({
      id: "share-1",
      owner: true,
    });
    await expect(shareService.getMetaData("share-1")).resolves.toEqual({
      id: "share-1",
      isZipReady: true,
    });
    await shareService.getShareToken("share-1", "password");
    await expect(shareService.isShareIdAvailable("share-1")).resolves.toBe(
      true,
    );

    expect(apiMock.get).toHaveBeenNthCalledWith(1, "shares/share-1");
    expect(apiMock.get).toHaveBeenNthCalledWith(2, "shares/share-1/from-owner");
    expect(apiMock.get).toHaveBeenNthCalledWith(3, "shares/share-1/metaData");
    expect(apiMock.post).toHaveBeenCalledWith("/shares/share-1/token", {
      password: "password",
    });
    expect(apiMock.get).toHaveBeenNthCalledWith(
      4,
      "/shares/isShareIdAvailable/share-1",
    );
  });

  it("classifies previewable and text files", () => {
    expect(shareService.doesFileSupportPreview("README.md")).toBe(true);
    expect(shareService.doesFileSupportPreview("archive.zip")).toBe(false);
    expect(shareService.isShareTextFile("notes.txt")).toBe(true);
    expect(shareService.isShareTextFile("script.sh")).toBe(true);
    expect(shareService.isShareTextFile("photo.png")).toBe(false);
  });

  it("downloads, deletes, and uploads share files", async () => {
    const location = mockWindowLocation();
    const chunk = new Blob(["hello"]);
    apiMock.post.mockResolvedValue(
      createAxiosResponse({ id: "file-1", name: "greeting.txt" }),
    );

    await shareService.downloadFile("share-1", "file-1");
    await shareService.downloadAdminAuditFile("share-1", "file-1");
    await shareService.removeFile("share-1", "file-1");
    await expect(
      shareService.uploadFile(
        "share-1",
        chunk,
        {
          id: "file-1",
          name: "greeting.txt",
        },
        0,
        1,
      ),
    ).resolves.toEqual({
      id: "file-1",
      name: "greeting.txt",
    });

    expect(location.href).toBe(
      "http://localhost/api/shares/share-1/audit/files/file-1",
    );
    expect(apiMock.delete).toHaveBeenCalledWith("shares/share-1/files/file-1");
    expect(apiMock.post).toHaveBeenCalledWith("shares/share-1/files", chunk, {
      headers: {
        "Content-Type": "application/octet-stream",
      },
      params: {
        chunkIndex: 0,
        id: "file-1",
        name: "greeting.txt",
        totalChunks: 1,
      },
    });
  });

  it("supports reverse-share creation and lookup flows", async () => {
    apiMock.post.mockResolvedValueOnce(
      createAxiosResponse({ id: "reverse-1", token: "token-1" }),
    );
    apiMock.get
      .mockResolvedValueOnce(createAxiosResponse([{ id: "reverse-1" }]))
      .mockResolvedValueOnce(createAxiosResponse({ id: "reverse-1" }));

    await expect(
      shareService.createReverseShare("7 days", 2048, 3, true, false, true),
    ).resolves.toEqual({
      id: "reverse-1",
      token: "token-1",
    });
    await expect(shareService.getMyReverseShares()).resolves.toEqual([
      { id: "reverse-1" },
    ]);
    await expect(shareService.setReverseShare("token-1")).resolves.toEqual({
      id: "reverse-1",
    });
    await shareService.removeReverseShare("reverse-1");

    expect(apiMock.post).toHaveBeenCalledWith("reverseShares", {
      maxShareSize: "2048",
      maxUseCount: 3,
      publicAccess: true,
      sendEmailNotification: true,
      shareExpiration: "7 days",
      simplified: false,
    });
    expect(apiMock.get).toHaveBeenNthCalledWith(1, "reverseShares");
    expect(apiMock.get).toHaveBeenNthCalledWith(2, "/reverseShares/token-1");
    expect(setCookieMock).toHaveBeenCalledWith(
      "reverse_share_token",
      "token-1",
    );
    expect(apiMock.delete).toHaveBeenCalledWith("/reverseShares/reverse-1");
  });

  it("exposes the shared owner-token cookie helper", () => {
    shareService.setShareOwnerToken("share-1", "owner-token");

    expect(setCookieMock).toHaveBeenCalledWith(
      "share_share-1_owner_token",
      "owner-token",
      {
        path: "/",
        sameSite: "lax",
      },
    );
  });
});
