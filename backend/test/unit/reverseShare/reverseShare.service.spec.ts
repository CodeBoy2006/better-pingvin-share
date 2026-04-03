import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ReverseShareService } from "src/reverseShare/reverseShare.service";
import { defaultConfigMockValues } from "../../fixtures/config.fixture";
import {
  buildCreateReverseShareDto,
  buildReverseShareEntity,
  buildShareEntity,
} from "../../fixtures/reverseShare.fixture";

const createConfigMock = (overrides: Record<string, unknown> = {}) => ({
  get: jest.fn(
    (key: string) =>
      ({
        ...defaultConfigMockValues,
        ...overrides,
      })[key],
  ),
});

describe("ReverseShareService", () => {
  let config: ReturnType<typeof createConfigMock>;
  let fileService: {
    deleteAllFiles: jest.Mock;
  };
  let prisma: {
    reverseShare: {
      create: jest.Mock;
      delete: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    share: {
      delete: jest.Mock;
      findMany: jest.Mock;
    };
  };
  let service: ReverseShareService;

  beforeEach(() => {
    config = createConfigMock();
    fileService = {
      deleteAllFiles: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      reverseShare: {
        create: jest.fn(),
        delete: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      share: {
        delete: jest.fn(),
        findMany: jest.fn(),
      },
    };

    service = new ReverseShareService(
      config as never,
      prisma as never,
      fileService as never,
    );
  });

  it("creates reverse shares with the expected simplified and public access flags", async () => {
    prisma.reverseShare.create.mockResolvedValue(
      buildReverseShareEntity({
        token: "reverse-token",
      }),
    );

    const token = await service.create(
      buildCreateReverseShareDto({
        maxShareSize: "512",
        publicAccess: false,
        simplified: true,
      }),
      "creator-id",
    );

    expect(prisma.reverseShare.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        creatorId: "creator-id",
        maxShareSize: "512",
        publicAccess: false,
        remainingUses: 5,
        sendEmailNotification: false,
        simplified: true,
      }),
    });
    expect(token).toBe("reverse-token");
  });

  it("rejects reverse shares that exceed the configured maximum expiration", async () => {
    await expect(
      service.create(
        buildCreateReverseShareDto({
          shareExpiration: "31-day",
        }),
        "creator-id",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects reverse shares that exceed the global max size", async () => {
    await expect(
      service.create(
        buildCreateReverseShareDto({
          maxShareSize: "1000001",
        }),
        "creator-id",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    [
      "valid reverse shares",
      buildReverseShareEntity({
        remainingUses: 1,
        shareExpiration: new Date("2999-01-01T00:00:00.000Z"),
      }),
      true,
    ],
    [
      "expired reverse shares",
      buildReverseShareEntity({
        shareExpiration: new Date("2000-01-01T00:00:00.000Z"),
      }),
      false,
    ],
    [
      "exhausted reverse shares",
      buildReverseShareEntity({
        remainingUses: 0,
      }),
      false,
    ],
  ])("detects %s", async (_label, reverseShare, expected) => {
    prisma.reverseShare.findUnique.mockResolvedValue(reverseShare);

    await expect(service.isValid(reverseShare.token)).resolves.toBe(expected);
  });

  it("removes linked shares and files when deleting a reverse share", async () => {
    prisma.share.findMany.mockResolvedValue([
      buildShareEntity({ id: "share-1" }),
      buildShareEntity({ id: "share-2" }),
    ]);
    prisma.share.delete.mockResolvedValue(undefined);
    prisma.reverseShare.delete.mockResolvedValue(undefined);

    await service.remove("reverse-share-id");

    expect(prisma.share.delete).toHaveBeenCalledTimes(2);
    expect(fileService.deleteAllFiles).toHaveBeenCalledTimes(2);
    expect(prisma.reverseShare.delete).toHaveBeenCalledWith({
      where: { id: "reverse-share-id" },
    });
  });

  it("only returns reverse shares owned by the current user", async () => {
    prisma.reverseShare.findUnique.mockResolvedValue(
      buildReverseShareEntity({
        creatorId: "another-user-id",
      }),
    );

    await expect(
      service.getByIdAndOwner("reverse-share-id", "current-user-id"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
