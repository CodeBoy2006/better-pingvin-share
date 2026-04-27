import { ExecutionContext } from "@nestjs/common";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ShareSecurityGuard } from "src/share/guard/shareSecurity.guard";

describe("ShareSecurityGuard", () => {
  let shareService: any;
  let prisma: any;
  let config: any;
  let guard: ShareSecurityGuard;

  const createContext = (request: any) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as ExecutionContext;

  beforeEach(() => {
    shareService = {
      assertShareIpAccess: jest.fn().mockResolvedValue(undefined),
      increaseViewCount: jest.fn().mockResolvedValue(undefined),
      verifyShareToken: jest.fn().mockResolvedValue(false),
    };
    prisma = {
      share: {
        findUnique: jest.fn(),
      },
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === "share.allowAdminAccessAllShares") {
          return false;
        }

        throw new Error(`Unexpected config lookup: ${key}`);
      }),
    };
    guard = new ShareSecurityGuard(
      shareService as never,
      prisma as never,
      config as never,
    );

    jest
      .spyOn(JwtGuard.prototype, "canActivate")
      .mockImplementation(async (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest();
        request.user = undefined;
        return true;
      });
  });

  it("allows public shares without requiring generated share tokens", async () => {
    const share = {
      id: "share-public",
      creatorId: "owner",
      expiration: new Date("2030-01-01T00:00:00.000Z"),
      removedReason: null,
      reverseShare: null,
      security: null,
      views: 1,
    };
    prisma.share.findUnique.mockResolvedValue(share);

    await expect(
      guard.canActivate(
        createContext({
          cookies: {},
          params: { id: "share-public" },
          query: {},
        }),
      ),
    ).resolves.toBe(true);

    expect(shareService.verifyShareToken).not.toHaveBeenCalled();
    expect(shareService.assertShareIpAccess).toHaveBeenCalledWith(
      share,
      expect.any(Object),
      {
        assignIfNeeded: true,
      },
    );
    expect(shareService.increaseViewCount).toHaveBeenCalledWith(share);
  });

  it("validates provided share tokens before allowing access", async () => {
    const share = {
      id: "share-public",
      creatorId: "owner",
      expiration: new Date("2030-01-01T00:00:00.000Z"),
      removedReason: null,
      reverseShare: null,
      security: null,
      views: 1,
    };
    prisma.share.findUnique.mockResolvedValue(share);
    shareService.verifyShareToken.mockResolvedValue(true);

    await expect(
      guard.canActivate(
        createContext({
          cookies: {},
          params: { id: "share-public" },
          query: { token: "valid-token" },
        }),
      ),
    ).resolves.toBe(true);

    expect(shareService.verifyShareToken).toHaveBeenCalledWith(
      "share-public",
      "valid-token",
    );
    expect(shareService.assertShareIpAccess).toHaveBeenCalledWith(
      share,
      expect.any(Object),
      {
        assignIfNeeded: true,
      },
    );
    expect(shareService.increaseViewCount).not.toHaveBeenCalled();
  });
});
