import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, jest } from "@jest/globals";
import { Readable } from "node:stream";
import { FileService } from "src/file/file.service";

describe("FileService", () => {
  let prisma: any;
  let localFileService: any;
  let s3FileService: any;
  let configService: any;

  function createService(s3Enabled = false) {
    configService = {
      get: jest.fn((key: string) => {
        if (key === "s3.enabled") {
          return s3Enabled;
        }

        throw new Error(`Unexpected config lookup: ${key}`);
      }),
    };

    prisma = {
      share: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      file: {
        findUnique: jest.fn(),
      },
    };
    localFileService = {
      create: jest.fn(),
      get: jest.fn(),
      remove: jest.fn(),
      deleteAllFiles: jest.fn(),
      getZip: jest.fn(),
      getZipForOwner: jest.fn(),
    };
    s3FileService = {
      create: jest.fn(),
      get: jest.fn(),
      remove: jest.fn(),
      deleteAllFiles: jest.fn(),
      getZip: jest.fn(),
    };

    return new FileService(
      prisma as any,
      localFileService as any,
      s3FileService as any,
      configService as any,
    );
  }

  it("delegates uploads to the configured storage backend", async () => {
    const localService = createService(false);
    localFileService.create.mockResolvedValue({ id: "local-file" });

    await expect(
      localService.create(
        "payload",
        { index: 0, total: 1 },
        { name: "a.txt" },
        "share-1",
      ),
    ).resolves.toEqual({ id: "local-file" });
    expect(localFileService.create).toHaveBeenCalledWith(
      "payload",
      { index: 0, total: 1 },
      { name: "a.txt" },
      "share-1",
    );

    const remoteService = createService(true);
    s3FileService.create.mockResolvedValue({ id: "remote-file" });

    await expect(
      remoteService.create(
        "payload",
        { index: 0, total: 1 },
        { name: "b.txt" },
        "share-2",
      ),
    ).resolves.toEqual({ id: "remote-file" });
    expect(s3FileService.create).toHaveBeenCalled();
  });

  it("loads files through the share's declared storage provider", async () => {
    const service = createService(false);
    const streamedFile = {
      metaData: {
        id: "file-1",
        size: "4",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        mimeType: "text/plain",
        name: "hello.txt",
        shareId: "share-1",
      },
      file: Readable.from(["test"]),
    };

    prisma.share.findFirst.mockResolvedValue({
      id: "share-1",
      storageProvider: "S3",
    });
    prisma.file.findUnique.mockResolvedValue({
      id: "file-1",
      shareId: "share-1",
    });
    s3FileService.get.mockResolvedValue(streamedFile);

    await expect(service.get("share-1", "file-1")).resolves.toEqual(
      streamedFile,
    );
    expect(s3FileService.get).toHaveBeenCalledWith("share-1", "file-1");
  });

  it("reads bounded samples from stored file streams", async () => {
    const service = createService(false);
    const fileStream = Readable.from([Buffer.from("abcdef")]);

    prisma.share.findFirst.mockResolvedValue({
      id: "share-1",
      storageProvider: "LOCAL",
    });
    prisma.file.findUnique.mockResolvedValue({
      id: "file-1",
      shareId: "share-1",
    });
    localFileService.get.mockResolvedValue({
      metaData: {
        id: "file-1",
        size: "6",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        mimeType: "text/plain",
        name: "hello.txt",
        shareId: "share-1",
      },
      file: fileStream,
    });

    await expect(service.readSample("share-1", "file-1", 3)).resolves.toEqual(
      new Uint8Array(Buffer.from("abc")),
    );
  });

  it("rejects file reads and deletes when the file does not belong to the share", async () => {
    const service = createService(false);

    prisma.file.findUnique.mockResolvedValue({
      id: "file-2",
      shareId: "other-share",
    });

    await expect(service.get("share-1", "file-2")).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.remove("share-1", "file-2")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("removes files through the share's declared storage provider", async () => {
    const service = createService(false);

    prisma.file.findUnique.mockResolvedValue({
      id: "file-3",
      shareId: "share-s3",
    });
    prisma.share.findUnique.mockResolvedValue({
      id: "share-s3",
      storageProvider: "S3",
    });

    await service.remove("share-s3", "file-3");
    expect(s3FileService.remove).toHaveBeenCalledWith("share-s3", "file-3");
  });

  it("serves owner ZIP downloads from the active backend", async () => {
    const service = createService(false);
    const localZip = Readable.from(["zip-data"]);
    const remoteZip = Readable.from(["zip-data"]);

    prisma.share.findUnique.mockResolvedValueOnce({
      id: "share-local",
      storageProvider: "LOCAL",
    });
    localFileService.getZipForOwner.mockResolvedValue(localZip);

    await expect(service.getZipForOwner("share-local")).resolves.toBe(localZip);

    prisma.share.findUnique.mockResolvedValueOnce({
      id: "share-s3",
      storageProvider: "S3",
    });
    s3FileService.getZip.mockResolvedValue(remoteZip);

    await expect(service.getZipForOwner("share-s3")).resolves.toBe(remoteZip);

    prisma.share.findUnique.mockResolvedValueOnce(null);

    await expect(service.getZipForOwner("missing-share")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("loads public ZIP downloads through the share's declared storage provider", async () => {
    const service = createService(false);
    const remoteZip = Readable.from(["remote-zip"]);

    prisma.share.findUnique.mockResolvedValue({
      id: "share-s3",
      storageProvider: "S3",
    });
    s3FileService.getZip.mockResolvedValue(remoteZip);

    await expect(service.getZip("share-s3")).resolves.toBe(remoteZip);
    expect(s3FileService.getZip).toHaveBeenCalledWith("share-s3");

    prisma.share.findUnique.mockResolvedValue(null);

    await expect(service.getZip("missing-share")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("deletes stored files through the share's declared storage provider", async () => {
    const service = createService(true);

    prisma.share.findUnique.mockResolvedValueOnce({
      id: "share-local",
      storageProvider: "LOCAL",
    });

    await service.deleteAllFiles("share-local");
    expect(localFileService.deleteAllFiles).toHaveBeenCalledWith("share-local");

    prisma.share.findUnique.mockResolvedValueOnce({
      id: "share-s3",
      storageProvider: "S3",
    });

    await service.deleteAllFiles("share-s3");
    expect(s3FileService.deleteAllFiles).toHaveBeenCalledWith("share-s3");

    await service.deleteAllFiles("share-orphaned", "LOCAL");
    expect(localFileService.deleteAllFiles).toHaveBeenCalledWith(
      "share-orphaned",
    );

    prisma.share.findUnique.mockResolvedValueOnce(null);

    await expect(service.deleteAllFiles("missing-share")).rejects.toThrow(
      NotFoundException,
    );
  });
});
