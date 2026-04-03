import type { User } from "@prisma/client";
import type { AuthRegisterDTO } from "src/auth/dto/authRegister.dto";
import type { AuthSignInDTO } from "src/auth/dto/authSignIn.dto";
import type { AuthSignInTotpDTO } from "src/auth/dto/authSignInTotp.dto";
import type { EnableTotpDTO } from "src/auth/dto/enableTotp.dto";
import type { ResetPasswordDTO } from "src/auth/dto/resetPassword.dto";
import type { UpdatePasswordDTO } from "src/auth/dto/updatePassword.dto";
import type { VerifyTotpDTO } from "src/auth/dto/verifyTotp.dto";

const fixedDate = new Date("2024-01-01T00:00:00.000Z");

let authSequence = 0;

const nextAuthSequence = () => {
  authSequence += 1;
  return authSequence;
};

export const buildAuthRegisterDto = (
  overrides: Partial<AuthRegisterDTO> = {},
): AuthRegisterDTO => {
  const sequence = nextAuthSequence();

  return {
    email: `auth-${sequence}@example.com`,
    username: `auth_${sequence}`,
    password: `Password${sequence}!`,
    ...overrides,
  };
};

export const buildAuthSignInDto = (
  overrides: Partial<AuthSignInDTO> = {},
): AuthSignInDTO => {
  const sequence = nextAuthSequence();

  return {
    email: `auth-${sequence}@example.com`,
    username: undefined,
    password: `Password${sequence}!`,
    ...overrides,
  };
};

export const buildAuthSignInTotpDto = (
  overrides: Partial<AuthSignInTotpDTO> = {},
): AuthSignInTotpDTO => ({
  loginToken: "login-token",
  totp: "123456",
  ...overrides,
});

export const buildEnableTotpDto = (
  overrides: Partial<EnableTotpDTO> = {},
): EnableTotpDTO => ({
  password: "Password123!",
  ...overrides,
});

export const buildVerifyTotpDto = (
  overrides: Partial<VerifyTotpDTO> = {},
): VerifyTotpDTO => ({
  password: "Password123!",
  code: "123456",
  ...overrides,
});

export const buildResetPasswordDto = (
  overrides: Partial<ResetPasswordDTO> = {},
): ResetPasswordDTO => ({
  token: "reset-token",
  password: "NewPassword123!",
  ...overrides,
});

export const buildUpdatePasswordDto = (
  overrides: Partial<UpdatePasswordDTO> = {},
): UpdatePasswordDTO => ({
  password: "NewPassword123!",
  oldPassword: "Password123!",
  ...overrides,
});

export const buildAuthUser = (overrides: Partial<User> = {}): User => {
  const sequence = nextAuthSequence();

  return {
    id: `user-${sequence}`,
    createdAt: fixedDate,
    updatedAt: fixedDate,
    username: `user_${sequence}`,
    email: `user-${sequence}@example.com`,
    password: "$argon2id$test-hash",
    isAdmin: false,
    ldapDN: null,
    totpEnabled: false,
    totpVerified: false,
    totpSecret: null,
    ...overrides,
  };
};
