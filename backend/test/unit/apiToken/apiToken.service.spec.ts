import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ApiTokenService } from "src/apiToken/apiToken.service";
import { API_TOKEN_PREFIX } from "src/apiToken/apiToken.constants";
import {
  buildApiTokenRecord,
  buildCreateApiTokenDto,
} from "../../fixtures/apiToken.fixture";

function buildUser(
  overrides: Partial<{
    id: string;
    email: string;
    username: string;
    isAdmin: boolean;
    ldapDN: string | null;
    password: string | null;
    totpVerified: boolean;
  }> = {},
) {
  return {
    id: "user-1",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
    email: "alice@test.local",
    username: "alice",
    password: "hashed-password",
    isAdmin: false,
    ldapDN: null,
    totpEnabled: false,
    totpVerified: false,
    totpSecret: null,
    ...overrides,
  };
}

describe("ApiTokenService", () => {
  const secret = "batch-c-api-token-secret";

  let prisma: any;
  let config: any;
  let service: ApiTokenService;

  beforeEach(() => {
    prisma = {
      apiToken: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === "internal.apiTokenSecret") {
          return secret;
        }

        throw new Error(`Unexpected config lookup: ${key}`);
      }),
    };
    service = new ApiTokenService(prisma as any, config as any);
  });

  it("creates normalized API tokens and returns the raw secret once", async () => {
    prisma.apiToken.create.mockImplementation(async ({ data }: any) =>
      buildApiTokenRecord({
        id: "token-1",
        name: data.name,
        scopes: data.scopes,
        secretHash: data.secretHash,
        expiresAt: data.expiresAt ?? null,
        userId: data.userId,
      }),
    );

    const created = await service.createForUser({
      userId: "user-1",
      ...buildCreateApiTokenDto({
        scopes: ["shares:write", "files:read", "shares:write"] as any,
      }),
    });

    expect(prisma.apiToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        name: "Batch C token",
        scopes: "files:read shares:write",
        secretHash: expect.any(String),
      }),
    });
    expect(created.scopes).toEqual(["files:read", "shares:write"]);
    expect(created.token).toMatch(
      new RegExp(`^${API_TOKEN_PREFIX}_token-1\\.[A-Za-z0-9_-]+$`),
    );
  });

  it("rejects tokens without valid scopes or with an invalid expiration", async () => {
    await expect(
      service.createForUser({
        userId: "user-1",
        name: "Invalid token",
        scopes: ["not-a-scope"],
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createForUser({
        userId: "user-1",
        name: "Expired token",
        scopes: ["shares:read"],
        expiresAt: "1999-01-01T00:00:00.000Z",
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("validates authorization headers against the stored secret hash", async () => {
    prisma.apiToken.create.mockImplementation(async ({ data }: any) =>
      buildApiTokenRecord({
        id: "token-2",
        name: data.name,
        scopes: data.scopes,
        secretHash: data.secretHash,
        userId: data.userId,
      }),
    );

    const created = await service.createForUser({
      userId: "user-2",
      name: "Integration token",
      scopes: ["shares:read", "files:write"],
    });

    const storedToken = buildApiTokenRecord({
      id: "token-2",
      name: "Integration token",
      scopes: "files:write shares:read",
      secretHash: (prisma.apiToken.create.mock.calls[0][0] as any).data
        .secretHash,
      userId: "user-2",
    });

    prisma.apiToken.findUnique.mockResolvedValue({
      ...storedToken,
      user: buildUser({ id: "user-2" }),
    });

    await expect(
      service.validateAuthorizationHeader(`Bearer ${created.token}`),
    ).resolves.toEqual(
      expect.objectContaining({
        tokenId: "token-2",
        scopes: ["files:write", "shares:read"],
        user: expect.objectContaining({ id: "user-2" }),
      }),
    );
  });

  it("rejects invalid, revoked, or expired credentials", async () => {
    await expect(
      service.validateAuthorizationHeader("Basic totally-not-bearer"),
    ).rejects.toThrow(UnauthorizedException);

    prisma.apiToken.findUnique.mockResolvedValue(
      buildApiTokenRecord({
        id: "token-3",
        revokedAt: new Date("2024-01-03T00:00:00.000Z"),
      }),
    );

    await expect(
      service.validateAuthorizationHeader(`Bearer ${API_TOKEN_PREFIX}_token-3.secret`),
    ).rejects.toThrow(UnauthorizedException);

    prisma.apiToken.findUnique.mockResolvedValue({
      ...buildApiTokenRecord({
        id: "token-4",
        expiresAt: new Date("2024-01-01T00:00:00.000Z"),
      }),
      user: buildUser({ id: "user-4" }),
    });

    await expect(
      service.validateAuthorizationHeader(`Bearer ${API_TOKEN_PREFIX}_token-4.secret`),
    ).rejects.toThrow(UnauthorizedException);
  });

  it("revokes only tokens owned by the current user", async () => {
    prisma.apiToken.findUnique.mockResolvedValueOnce(
      buildApiTokenRecord({
        id: "token-5",
        userId: "user-5",
      }),
    );

    await service.revokeForUser("token-5", "user-5");

    expect(prisma.apiToken.update).toHaveBeenCalledWith({
      where: { id: "token-5" },
      data: { revokedAt: expect.any(Date) },
    });

    prisma.apiToken.findUnique.mockResolvedValueOnce(
      buildApiTokenRecord({
        id: "token-6",
        userId: "other-user",
      }),
    );

    await expect(service.revokeForUser("token-6", "user-5")).rejects.toThrow(
      NotFoundException,
    );
  });
});
