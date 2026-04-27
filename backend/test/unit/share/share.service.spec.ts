import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import * as argon from "argon2";
import moment from "moment";
import { ShareService } from "src/share/share.service";
import { buildCreateShareDto } from "../../fixtures/share.fixture";

const createRequest = (ip: string, forwardedFor?: string) =>
  ({
    ip,
    headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  }) as any;

describe("ShareService", () => {
  let prisma: any;
  let config: any;
  let fileService: any;
  let emailService: any;
  let jwtService: any;
  let reverseShareService: any;
  let clamScanService: any;
  let service: ShareService;

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      share: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
      },
      reverseShare: {
        update: jest.fn(),
      },
      file: {
        findMany: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementation((callback) =>
      callback({
        shareSecurityAssignedIp: {
          findUnique: jest.fn(),
          count: jest.fn(),
          create: jest.fn(),
        },
      }),
    );
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          "share.maxExpiration": { value: 0, unit: "days" },
          "share.expiredEditablePeriod": { value: 0, unit: "days" },
          "share.allowAdminAccessAllShares": false,
          "share.zipCompressionLevel": 9,
          "s3.enabled": false,
          "smtp.enabled": false,
          "general.appUrl": "http://localhost:3000",
          "internal.jwtSecret": "jwt-secret",
        };

        if (!(key in values)) {
          throw new Error(`Unexpected config lookup: ${key}`);
        }

        return values[key];
      }),
    };
    fileService = {
      deleteAllFiles: jest.fn(),
    };
    emailService = {
      sendMailToShareRecipients: jest.fn(),
      sendMailToReverseShareCreator: jest.fn(),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue("jwt-token"),
      verify: jest.fn(),
    };
    reverseShareService = {
      getByToken: jest.fn().mockImplementation(async () => null),
    };
    clamScanService = {
      checkAndRemove: jest.fn(),
    };

    service = new ShareService(
      prisma as any,
      config as any,
      fileService as any,
      emailService as any,
      config as any,
      jwtService as any,
      reverseShareService as any,
      clamScanService as any,
    );
  });

  it("creates anonymous shares with hashed passwords and owner access", async () => {
    prisma.share.findUnique.mockResolvedValueOnce(null);
    prisma.share.create.mockResolvedValue({
      id: "share-anon",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      expiration: new Date("2024-01-02T00:00:00.000Z"),
      name: null,
      description: null,
      creatorId: null,
      uploadLocked: false,
      isZipReady: false,
      views: 0,
      storageProvider: "LOCAL",
      removedReason: null,
      reverseShareId: null,
    });
    jest
      .spyOn(service, "generateShareOwnerToken")
      .mockResolvedValue("owner-token");

    const result = await service.create(
      buildCreateShareDto({
        id: "share-anon",
        security: { password: "super-secret" },
      }) as any,
    );

    const createCall = prisma.share.create.mock.calls[0][0] as any;

    expect(
      await argon.verify(
        createCall.data.security.create.password,
        "super-secret",
      ),
    ).toBe(true);
    expect(createCall.data.storageProvider).toBe("LOCAL");
    expect(result).toEqual(
      expect.objectContaining({
        id: "share-anon",
        ownerToken: "owner-token",
        ownerManagementLink:
          "http://localhost:3000/share/share-anon/edit#ownerToken=owner-token",
      }),
    );
  });

  it("normalizes specific IP restrictions before persisting a share", async () => {
    prisma.share.findUnique.mockResolvedValueOnce(null);
    prisma.share.create.mockResolvedValue({
      id: "share-ip-restricted",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      expiration: new Date("2024-01-02T00:00:00.000Z"),
      name: null,
      description: null,
      creatorId: null,
      uploadLocked: false,
      isZipReady: false,
      views: 0,
      storageProvider: "LOCAL",
      removedReason: null,
      reverseShareId: null,
    });
    jest
      .spyOn(service, "generateShareOwnerToken")
      .mockResolvedValue("owner-token");

    await service.create(
      buildCreateShareDto({
        id: "share-ip-restricted",
        security: {
          allowedIps: [" ::ffff:203.0.113.7 ", "2001:0db8::1"],
        },
      }) as any,
    );

    const createCall = prisma.share.create.mock.calls[0][0] as any;

    expect(createCall.data.security.create.allowedIps.create).toEqual([
      { ipAddress: "203.0.113.7" },
      { ipAddress: "2001:db8::1" },
    ]);
  });

  it("rejects duplicate share identifiers before creating files", async () => {
    prisma.share.findUnique.mockResolvedValueOnce({ id: "share-duplicate" });

    await expect(
      service.create(buildCreateShareDto({ id: "share-duplicate" }) as any),
    ).rejects.toThrow(BadRequestException);

    expect(prisma.share.create).not.toHaveBeenCalled();
  });

  it("uses reverse share expiration and links the new share back to the token", async () => {
    prisma.share.findUnique.mockResolvedValueOnce(null);
    prisma.share.create.mockResolvedValue({
      id: "share-reverse",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      expiration: new Date("2030-01-01T00:00:00.000Z"),
      name: null,
      description: null,
      creatorId: "creator-1",
      uploadLocked: false,
      isZipReady: false,
      views: 0,
      storageProvider: "LOCAL",
      removedReason: null,
      reverseShareId: "reverse-share-1",
    });
    reverseShareService.getByToken.mockResolvedValue({
      id: "reverse-share-1",
      token: "reverse-token",
      shareExpiration: new Date("2030-01-01T00:00:00.000Z"),
    });

    await service.create(
      buildCreateShareDto({ id: "share-reverse" }) as any,
      { id: "creator-1" } as any,
      "reverse-token",
    );

    expect(prisma.share.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          expiration: new Date("2030-01-01T00:00:00.000Z"),
        }),
      }),
    );
    expect(prisma.reverseShare.update).toHaveBeenCalledWith({
      where: { token: "reverse-token" },
      data: {
        shares: {
          connect: { id: "share-reverse" },
        },
      },
    });
  });

  it("refuses to complete shares that are already locked or empty", async () => {
    jest.spyOn(service, "isShareCompleted").mockResolvedValueOnce(true);
    prisma.share.findUnique.mockResolvedValue({
      id: "share-1",
      files: [{ id: "file-1" }],
      recipients: [],
      creator: null,
      reverseShare: null,
      description: null,
      expiration: new Date("2024-01-02T00:00:00.000Z"),
    });

    await expect(service.complete("share-1")).rejects.toThrow(
      BadRequestException,
    );

    jest.spyOn(service, "isShareCompleted").mockResolvedValueOnce(false);
    prisma.share.findUnique.mockResolvedValue({
      id: "share-2",
      files: [],
      recipients: [],
      creator: null,
      reverseShare: null,
      description: null,
      expiration: new Date("2024-01-02T00:00:00.000Z"),
    });

    await expect(service.complete("share-2")).rejects.toThrow(
      BadRequestException,
    );
  });

  it("completes anonymous reverse-share uploads and decrements remaining uses", async () => {
    jest.spyOn(service, "isShareCompleted").mockResolvedValue(false);
    jest
      .spyOn(service, "generateShareOwnerToken")
      .mockResolvedValue("owner-after-complete");

    prisma.share.findUnique.mockResolvedValue({
      id: "share-3",
      creatorId: null,
      files: [{ id: "file-1", name: "hello.txt", size: "5" }],
      recipients: [],
      creator: null,
      reverseShare: {
        id: "reverse-share-2",
        creator: { email: "reverse@test.local" },
        sendEmailNotification: false,
      },
      description: null,
      expiration: new Date("2024-01-02T00:00:00.000Z"),
    });
    prisma.share.update.mockResolvedValue({
      id: "share-3",
      uploadLocked: true,
      isZipReady: false,
    });

    const result = await service.complete("share-3", "reverse-token");

    expect(prisma.reverseShare.update).toHaveBeenCalledWith({
      where: { token: "reverse-token" },
      data: { remainingUses: { decrement: 1 } },
    });
    expect(clamScanService.checkAndRemove).toHaveBeenCalledWith("share-3");
    expect(result).toEqual(
      expect.objectContaining({
        uploadLocked: true,
        ownerToken: "owner-after-complete",
      }),
    );
  });

  it("blocks private reverse shares from unrelated viewers", async () => {
    prisma.share.findUnique.mockResolvedValue({
      id: "share-private",
      uploadLocked: true,
      removedReason: null,
      creatorId: "share-owner",
      expiration: new Date("2030-01-02T00:00:00.000Z"),
      files: [],
      security: null,
      reverseShare: {
        creatorId: "reverse-owner",
        publicAccess: false,
      },
      views: 0,
    });

    await expect(
      service.getFileList("share-private", createRequest("198.51.100.20"), {
        userId: "outsider",
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it("does not let admin access bypass share expiration for file listings", async () => {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        "share.maxExpiration": { value: 0, unit: "days" },
        "share.expiredEditablePeriod": { value: 0, unit: "days" },
        "share.allowAdminAccessAllShares": true,
        "share.zipCompressionLevel": 9,
        "s3.enabled": false,
        "smtp.enabled": false,
        "general.appUrl": "http://localhost:3000",
        "internal.jwtSecret": "jwt-secret",
      };

      if (!(key in values)) {
        throw new Error(`Unexpected config lookup: ${key}`);
      }

      return values[key];
    });

    prisma.share.findUnique.mockResolvedValue({
      id: "share-expired-admin",
      uploadLocked: true,
      removedReason: null,
      creatorId: "share-owner",
      expiration: new Date("2000-01-01T00:00:00.000Z"),
      files: [],
      security: null,
      reverseShare: null,
      views: 0,
    });

    await expect(
      service.getFileList(
        "share-expired-admin",
        createRequest("198.51.100.20"),
        {
          isAdmin: true,
        },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it("returns retained expired share contents through the admin audit path", async () => {
    prisma.share.findUnique.mockResolvedValue({
      id: "share-expired-admin",
      uploadLocked: true,
      removedReason: null,
      creatorId: "share-owner",
      expiration: new Date("2000-01-01T00:00:00.000Z"),
      files: [{ id: "file-1", name: "retained.txt", size: "8" }],
      security: null,
      creator: { id: "share-owner" },
      views: 0,
    });

    await expect(
      service.getAdminAuditShare("share-expired-admin"),
    ).resolves.toEqual(
      expect.objectContaining({
        id: "share-expired-admin",
        files: [expect.objectContaining({ id: "file-1" })],
        size: 8,
      }),
    );
  });

  it("blocks admin audit access to removed shares", async () => {
    prisma.share.findUnique.mockResolvedValue({
      id: "share-removed",
      removedReason: "Removed by malware scan",
    });

    await expect(service.getAdminAuditShare("share-removed")).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      service.getAdminAuditFile("share-removed", "file-1"),
    ).rejects.toThrow(NotFoundException);
  });

  it("generates share tokens for public file listings and increments view counts", async () => {
    prisma.share.findUnique.mockResolvedValue({
      id: "share-public",
      uploadLocked: true,
      removedReason: null,
      creatorId: "share-owner",
      expiration: new Date("2030-01-02T00:00:00.000Z"),
      files: [],
      security: null,
      reverseShare: null,
      views: 4,
    });
    jest.spyOn(service, "generateShareToken").mockResolvedValue("share-token");
    jest.spyOn(service, "increaseViewCount").mockResolvedValue(undefined);

    const result = await service.getFileList(
      "share-public",
      createRequest("198.51.100.20"),
    );

    expect(service.increaseViewCount).toHaveBeenCalledWith(
      expect.objectContaining({ id: "share-public" }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        shareToken: "share-token",
        generatedShareToken: true,
      }),
    );
  });

  it("only hard deletes anonymous shares when elevated access is provided", async () => {
    prisma.share.findUnique.mockResolvedValueOnce({
      id: "share-anonymous",
      creatorId: null,
    });

    await expect(service.remove("share-anonymous")).rejects.toThrow(
      ForbiddenException,
    );

    prisma.share.findUnique.mockResolvedValueOnce({
      id: "share-admin-delete",
      creatorId: "user-1",
    });

    await service.remove("share-admin-delete", { isDeleterAdmin: true });

    expect(fileService.deleteAllFiles).toHaveBeenCalledWith(
      "share-admin-delete",
    );
    expect(prisma.share.delete).toHaveBeenCalledWith({
      where: { id: "share-admin-delete" },
    });
  });

  it("hides expired shares outside the editable owner window", async () => {
    prisma.share.findUnique.mockResolvedValue({
      id: "share-expired",
      creatorId: null,
      expiration: new Date("2000-01-01T00:00:00.000Z"),
      removedReason: null,
      recipients: [],
      files: [],
      security: null,
    });

    await expect(service.getForOwner("share-expired")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("updates retained expired shares and replaces security rules", async () => {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        "share.maxExpiration": { value: 30, unit: "days" },
        "share.expiredEditablePeriod": { value: 7, unit: "days" },
        "share.allowAdminAccessAllShares": false,
        "share.zipCompressionLevel": 9,
        "s3.enabled": false,
        "smtp.enabled": false,
        "general.appUrl": "http://localhost:3000",
        "internal.jwtSecret": "jwt-secret",
      };

      if (!(key in values)) {
        throw new Error(`Unexpected config lookup: ${key}`);
      }

      return values[key];
    });

    const recoveredExpiration = moment().add(1, "day").milliseconds(0).toDate();

    prisma.share.findUnique
      .mockResolvedValueOnce({
        id: "share-retained",
        creatorId: "owner-1",
        expiration: moment().subtract(1, "day").toDate(),
        removedReason: null,
        recipients: [{ email: "old@example.com" }],
        files: [],
        security: {
          password: await argon.hash("old-password"),
          maxViews: null,
          maxIps: 1,
          allowedIps: [],
          assignedIps: [{ ipAddress: "198.51.100.7" }],
        },
      })
      .mockResolvedValueOnce({
        id: "share-retained",
        creatorId: "owner-1",
        expiration: recoveredExpiration,
        removedReason: null,
        recipients: [{ email: "new@example.com" }],
        files: [],
        security: {
          password: null,
          maxViews: 5,
          maxIps: null,
          allowedIps: [{ ipAddress: "203.0.113.8" }],
          assignedIps: [],
        },
      });
    prisma.share.update.mockResolvedValue({});

    await service.update(
      "share-retained",
      {
        expiration: recoveredExpiration.toISOString(),
        name: "Recovered share",
        recipients: ["new@example.com"],
        security: {
          password: "",
          maxViews: 5,
          allowedIps: ["::ffff:203.0.113.8"],
        },
      },
      { userId: "owner-1" },
    );

    expect(prisma.share.update).toHaveBeenCalledWith({
      where: { id: "share-retained" },
      data: expect.objectContaining({
        name: "Recovered share",
        expiration: recoveredExpiration,
        recipients: {
          deleteMany: {},
          create: [{ email: "new@example.com" }],
        },
        security: {
          upsert: expect.objectContaining({
            update: expect.objectContaining({
              password: null,
              maxViews: 5,
              maxIps: null,
              allowedIps: {
                deleteMany: {},
                create: [{ ipAddress: "203.0.113.8" }],
              },
              assignedIps: {
                deleteMany: {},
              },
            }),
          }),
        },
      }),
    });
  });

  it("lets admins bypass maximum expiration while editing", async () => {
    config.get.mockImplementation((key: string) => {
      const values: Record<string, unknown> = {
        "share.maxExpiration": { value: 1, unit: "days" },
        "share.expiredEditablePeriod": { value: 7, unit: "days" },
        "share.allowAdminAccessAllShares": false,
        "share.zipCompressionLevel": 9,
        "s3.enabled": false,
        "smtp.enabled": false,
        "general.appUrl": "http://localhost:3000",
        "internal.jwtSecret": "jwt-secret",
      };

      if (!(key in values)) {
        throw new Error(`Unexpected config lookup: ${key}`);
      }

      return values[key];
    });

    prisma.share.findUnique
      .mockResolvedValueOnce({
        id: "share-admin-edit",
        creatorId: "owner-1",
        expiration: moment().subtract(1, "day").toDate(),
        removedReason: null,
        recipients: [],
        files: [],
        security: null,
      })
      .mockResolvedValueOnce({
        id: "share-admin-edit",
        creatorId: "owner-1",
        expiration: new Date("2030-01-01T00:00:00.000Z"),
        removedReason: null,
        recipients: [],
        files: [],
        security: null,
      });
    prisma.share.update.mockResolvedValue({});

    await expect(
      service.update(
        "share-admin-edit",
        { expiration: "2030-01-01T00:00:00.000Z" },
        { isAdmin: true },
      ),
    ).resolves.toEqual(expect.objectContaining({ id: "share-admin-edit" }));

    prisma.share.findUnique.mockResolvedValueOnce({
      id: "share-owner-edit",
      creatorId: "owner-1",
      expiration: moment().subtract(1, "day").toDate(),
      removedReason: null,
      recipients: [],
      files: [],
      security: null,
    });

    await expect(
      service.update(
        "share-owner-edit",
        { expiration: "2030-01-01T00:00:00.000Z" },
        { userId: "owner-1" },
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it("rejects incorrect passwords when minting share tokens", async () => {
    prisma.share.findFirst.mockResolvedValue({
      id: "share-password",
      views: 0,
      security: {
        password: await argon.hash("correct-password"),
        maxViews: null,
        maxIps: null,
        allowedIps: [],
        assignedIps: [],
      },
    });

    await expect(
      service.getShareToken(
        "share-password",
        "wrong-password",
        createRequest("198.51.100.20"),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows already assigned IPs and registers new ones when the share has an IP quota", async () => {
    const assignShareIpAddressSpy = jest
      .spyOn(service as any, "assignShareIpAddress")
      .mockResolvedValue(true);

    await expect(
      service.assertShareIpAccess(
        {
          security: {
            id: "security-1",
            password: null,
            maxViews: null,
            maxIps: 2,
            allowedIps: [],
            assignedIps: [{ ipAddress: "198.51.100.10" }],
          },
        },
        createRequest("::ffff:198.51.100.11"),
        { assignIfNeeded: true },
      ),
    ).resolves.toBeUndefined();

    expect(assignShareIpAddressSpy).toHaveBeenCalledWith(
      "security-1",
      "198.51.100.11",
      2,
    );
  });

  it("rejects IPs outside the configured allow list", async () => {
    await expect(
      service.assertShareIpAccess(
        {
          security: {
            id: "security-allow-list",
            password: null,
            maxViews: null,
            maxIps: null,
            allowedIps: [{ ipAddress: "198.51.100.10" }],
            assignedIps: [],
          },
        },
        createRequest("198.51.100.20"),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
