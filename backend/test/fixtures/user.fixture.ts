import type { User } from "@prisma/client";
import type { Entry } from "ldapts";
import { CreateUserDTO } from "src/user/dto/createUser.dto";
import { UpdateOwnUserDTO } from "src/user/dto/updateOwnUser.dto";
import { UpdateUserDto } from "src/user/dto/updateUser.dto";
import { buildAuthUser } from "./auth.fixture";

let userSequence = 0;

const nextUserSequence = () => {
  userSequence += 1;
  return userSequence;
};

export const buildCreateUserDto = (
  overrides: Partial<CreateUserDTO> = {},
): CreateUserDTO => {
  const sequence = nextUserSequence();

  return Object.assign(new CreateUserDTO(), {
    email: `managed-${sequence}@example.com`,
    username: `managed_${sequence}`,
    password: `Password${sequence}!`,
    isAdmin: false,
    hasPassword: true,
    isLdap: false,
    totpVerified: false,
    ...overrides,
  });
};

export const buildUpdateUserDto = (
  overrides: Partial<UpdateUserDto> = {},
): UpdateUserDto =>
  Object.assign(new UpdateUserDto(), {
    username: "updated_user",
    email: "updated@example.com",
    password: "UpdatedPassword123!",
    isAdmin: true,
    ...overrides,
  });

export const buildUpdateOwnUserDto = (
  overrides: Partial<UpdateOwnUserDTO> = {},
): UpdateOwnUserDTO =>
  Object.assign(new UpdateOwnUserDTO(), {
    username: "self_updated",
    email: "self.updated@example.com",
    ...overrides,
  });

export const buildUserEntity = (overrides: Partial<User> = {}): User =>
  buildAuthUser(overrides);

export const buildLdapEntry = (overrides: Partial<Entry> = {}): Entry =>
  ({
    dn: "cn=test-user,dc=example,dc=com",
    userPrincipalName: "ldap.user@example.com",
    memberOf: ["admins"],
    ...overrides,
  }) as Entry;
