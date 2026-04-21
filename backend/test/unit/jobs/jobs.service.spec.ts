import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as fs from "fs";
import { JobsService } from "src/jobs/jobs.service";

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readdirSync: jest.fn(jest.requireActual("fs").readdirSync),
  rmSync: jest.fn(jest.requireActual("fs").rmSync),
  statSync: jest.fn(jest.requireActual("fs").statSync),
}));

const createService = () => {
  const prisma = {
    loginToken: {
      deleteMany: jest.fn(),
    },
    refreshToken: {
      deleteMany: jest.fn(),
    },
    resetPasswordToken: {
      deleteMany: jest.fn(),
    },
    reverseShare: {
      findMany: jest.fn(),
    },
    share: {
      delete: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const reverseShareService = {
    remove: jest.fn(),
  };
  const fileService = {
    deleteAllFiles: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === "share.fileRetentionPeriod") {
        return { value: 7, unit: "days" };
      }

      throw new Error(`Unexpected config lookup: ${key}`);
    }),
  };

  const service = new JobsService(
    prisma as never,
    reverseShareService as never,
    fileService as never,
    configService as never,
  );
  const loggerLog = jest
    .spyOn(service["logger"], "log")
    .mockImplementation(() => undefined);

  return {
    configService,
    fileService,
    loggerLog,
    prisma,
    reverseShareService,
    service,
  };
};

describe("JobsService", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("deletes expired shares and their stored files", async () => {
    const { prisma, fileService, loggerLog, service } = createService();

    prisma.share.findMany.mockResolvedValue([
      { id: "share-1", storageProvider: "LOCAL" },
      { id: "share-2", storageProvider: "S3" },
    ]);

    await service.deleteExpiredShares();

    expect(prisma.share.findMany).toHaveBeenCalledWith({
      where: {
        AND: [
          { expiration: { lt: expect.any(Date) } },
          { expiration: { not: new Date(0) } },
        ],
      },
    });
    expect(fileService.deleteAllFiles).toHaveBeenNthCalledWith(
      1,
      "share-1",
      "LOCAL",
    );
    expect(prisma.share.delete).toHaveBeenNthCalledWith(1, {
      where: { id: "share-1" },
    });
    expect(fileService.deleteAllFiles).toHaveBeenNthCalledWith(
      2,
      "share-2",
      "S3",
    );
    expect(prisma.share.delete).toHaveBeenNthCalledWith(2, {
      where: { id: "share-2" },
    });
    expect(fileService.deleteAllFiles.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.share.delete.mock.invocationCallOrder[0],
    );
    expect(fileService.deleteAllFiles.mock.invocationCallOrder[1]).toBeLessThan(
      prisma.share.delete.mock.invocationCallOrder[1],
    );
    expect(loggerLog).toHaveBeenCalledWith("Deleted 2 expired shares");
  });

  it("removes expired reverse shares and skips logging when nothing expired", async () => {
    const { prisma, reverseShareService, loggerLog, service } = createService();

    prisma.reverseShare.findMany.mockResolvedValueOnce([
      { id: "reverse-1" },
      { id: "reverse-2" },
    ]);

    await service.deleteExpiredReverseShares();

    expect(prisma.reverseShare.findMany).toHaveBeenCalledWith({
      where: {
        shareExpiration: { lt: expect.any(Date) },
      },
    });
    expect(reverseShareService.remove).toHaveBeenNthCalledWith(1, "reverse-1");
    expect(reverseShareService.remove).toHaveBeenNthCalledWith(2, "reverse-2");
    expect(loggerLog).toHaveBeenCalledWith("Deleted 2 expired reverse shares");

    loggerLog.mockClear();
    prisma.reverseShare.findMany.mockResolvedValueOnce([]);

    await service.deleteExpiredReverseShares();

    expect(loggerLog).not.toHaveBeenCalled();
  });

  it("deletes unfinished shares that are older than one day", async () => {
    const { prisma, fileService, loggerLog, service } = createService();

    prisma.share.findMany.mockResolvedValue([
      { id: "draft-1", storageProvider: "LOCAL" },
    ]);

    await service.deleteUnfinishedShares();

    expect(prisma.share.findMany).toHaveBeenCalledWith({
      where: {
        createdAt: { lt: expect.any(Date) },
        uploadLocked: false,
      },
    });
    expect(fileService.deleteAllFiles).toHaveBeenCalledWith("draft-1", "LOCAL");
    expect(prisma.share.delete).toHaveBeenCalledWith({
      where: { id: "draft-1" },
    });
    expect(fileService.deleteAllFiles.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.share.delete.mock.invocationCallOrder[0],
    );
    expect(loggerLog).toHaveBeenCalledWith("Deleted 1 unfinished shares");
  });

  it("removes only stale temporary chunk files", () => {
    const { loggerLog, service } = createService();
    const readdirSpy = jest.mocked(fs.readdirSync);
    const statSpy = jest.mocked(fs.statSync);
    const rmSpy = jest.mocked(fs.rmSync).mockImplementation(() => undefined);

    readdirSpy
      .mockReturnValueOnce([
        {
          isDirectory: () => true,
          name: "share-1",
        },
        {
          isDirectory: () => true,
          name: "share-2",
        },
      ] as never)
      .mockReturnValueOnce([
        "fresh.tmp-chunk",
        "stale.tmp-chunk",
        "finished.txt",
      ] as never)
      .mockReturnValueOnce(["ancient.tmp-chunk"] as never);

    statSpy
      .mockReturnValueOnce({
        mtime: new Date(),
      } as never)
      .mockReturnValueOnce({
        mtime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      } as never)
      .mockReturnValueOnce({
        mtime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      } as never);

    service.deleteTemporaryFiles();

    expect(rmSpy).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("share-1/stale.tmp-chunk"),
    );
    expect(rmSpy).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("share-2/ancient.tmp-chunk"),
    );
    expect(loggerLog).toHaveBeenCalledWith("Deleted 2 temporary files");
  });

  it("deletes expired auth tokens and logs the aggregated count", async () => {
    const { prisma, loggerLog, service } = createService();

    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 2 });
    prisma.loginToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.resetPasswordToken.deleteMany.mockResolvedValue({ count: 3 });

    await service.deleteExpiredTokens();

    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
    expect(prisma.loginToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
    expect(prisma.resetPasswordToken.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } },
    });
    expect(loggerLog).toHaveBeenCalledWith("Deleted 6 expired refresh tokens");
  });
});
