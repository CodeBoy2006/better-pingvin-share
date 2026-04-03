import { BadRequestException } from "@nestjs/common";
import * as argon from "argon2";
import { UserSevice } from "src/user/user.service";
import { buildAuthSignInDto } from "../../fixtures/auth.fixture";
import { defaultConfigMockValues } from "../../fixtures/config.fixture";
import {
  buildCreateUserDto,
  buildLdapEntry,
  buildUpdateUserDto,
  buildUserEntity,
} from "../../fixtures/user.fixture";
import { createUniqueConstraintError } from "../../helpers/prisma-test-error";

const createPrismaMock = () => ({
  user: {
    count: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
  },
});

describe("UserSevice", () => {
  let configService: {
    get: jest.Mock;
  };
  let emailService: {
    sendInviteEmail: jest.Mock;
  };
  let fileService: {
    deleteAllFiles: jest.Mock;
  };
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: UserSevice;

  beforeEach(() => {
    configService = {
      get: jest.fn((key: string) => defaultConfigMockValues[key]),
    };
    emailService = {
      sendInviteEmail: jest.fn(),
    };
    fileService = {
      deleteAllFiles: jest.fn().mockResolvedValue(undefined),
    };
    prisma = createPrismaMock();

    service = new UserSevice(
      prisma as never,
      emailService as never,
      fileService as never,
      configService as never,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("creates a managed user with a hashed password", async () => {
    const dto = buildCreateUserDto({
      password: "ManagedPassword123!",
    });
    const user = buildUserEntity({
      email: dto.email,
      isAdmin: dto.isAdmin,
      username: dto.username,
    });
    prisma.user.create.mockResolvedValue(user);

    const result = await service.create(dto);

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: dto.email,
        isAdmin: dto.isAdmin,
        username: dto.username,
      }),
    });
    expect(
      await argon.verify(
        prisma.user.create.mock.calls[0][0].data.password,
        dto.password,
      ),
    ).toBe(true);
    expect(result).toBe(user);
  });

  it("creates invited users with a generated password and invite email", async () => {
    const dto = buildCreateUserDto({
      password: undefined,
    });
    prisma.user.create.mockResolvedValue(
      buildUserEntity({
        email: dto.email,
        username: dto.username,
      }),
    );

    await service.create(dto);

    expect(emailService.sendInviteEmail).toHaveBeenCalledTimes(1);
    expect(emailService.sendInviteEmail).toHaveBeenCalledWith(
      dto.email,
      expect.any(String),
    );
    expect(
      await argon.verify(
        prisma.user.create.mock.calls[0][0].data.password,
        emailService.sendInviteEmail.mock.calls[0][1],
      ),
    ).toBe(true);
  });

  it("translates duplicate user creation failures into a bad request", async () => {
    prisma.user.create.mockRejectedValue(createUniqueConstraintError("email"));

    await expect(service.create(buildCreateUserDto())).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("hashes the replacement password when updating a user", async () => {
    const dto = buildUpdateUserDto({
      password: "UpdatedPassword123!",
    });
    prisma.user.update.mockResolvedValue(
      buildUserEntity({
        email: dto.email,
        isAdmin: dto.isAdmin,
        username: dto.username,
      }),
    );

    await service.update("user-id", dto);

    expect(prisma.user.update).toHaveBeenCalledWith({
      data: {
        ...dto,
        password: expect.any(String),
      },
      where: { id: "user-id" },
    });
    expect(
      await argon.verify(
        prisma.user.update.mock.calls[0][0].data.password,
        dto.password,
      ),
    ).toBe(true);
  });

  it("prevents deleting the last admin user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...buildUserEntity({
        isAdmin: true,
      }),
      shares: [],
    } as never);
    prisma.user.count.mockResolvedValue(1);

    await expect(service.delete("admin-user-id")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("deletes all managed files before removing a user", async () => {
    prisma.user.findUnique.mockResolvedValue({
      ...buildUserEntity(),
      isAdmin: false,
      shares: [{ id: "share-1" }, { id: "share-2" }],
    });
    prisma.user.delete.mockResolvedValue(buildUserEntity());

    await service.delete("user-id");

    expect(fileService.deleteAllFiles).toHaveBeenCalledTimes(2);
    expect(fileService.deleteAllFiles).toHaveBeenNthCalledWith(1, "share-1");
    expect(fileService.deleteAllFiles).toHaveBeenNthCalledWith(2, "share-2");
    expect(prisma.user.delete).toHaveBeenCalledWith({
      where: { id: "user-id" },
    });
  });

  it("syncs LDAP users with admin groups and email fallbacks", async () => {
    const ldapEntry = buildLdapEntry();
    const credentials = buildAuthSignInDto({
      email: "provided@example.com",
      username: "ldap_user",
    });
    const upsertedUser = buildUserEntity({
      email: "placeholder@ldap.local",
      ldapDN: ldapEntry.dn,
      username: credentials.username,
    });
    prisma.user.upsert.mockResolvedValue(upsertedUser);
    prisma.user.update.mockResolvedValue({
      ...upsertedUser,
      email: credentials.email,
    });

    const result = await service.findOrCreateFromLDAP(credentials, ldapEntry);

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        email: credentials.email,
        isAdmin: true,
        ldapDN: ldapEntry.dn,
        username: credentials.username,
      }),
      update: {
        isAdmin: true,
        ldapDN: ldapEntry.dn,
      },
      where: {
        ldapDN: ldapEntry.dn,
      },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      data: {
        email: credentials.email,
      },
      where: {
        id: upsertedUser.id,
      },
    });
    expect(result.email).toBe(credentials.email);
  });
});
