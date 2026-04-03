import { randomUUID } from "node:crypto";
import { ApiToken } from "@prisma/client";
import {
  API_TOKEN_SCOPES,
  type ApiTokenScope,
} from "src/apiToken/apiToken.constants";

export const ALL_API_TOKEN_SCOPES = [...API_TOKEN_SCOPES];

export function buildCreateApiTokenDto(
  overrides: Partial<{
    name: string;
    scopes: ApiTokenScope[];
    expiresAt?: string;
  }> = {},
) {
  return {
    name: "Batch C token",
    scopes: ALL_API_TOKEN_SCOPES,
    ...overrides,
  };
}

export function buildApiTokenRecord(
  overrides: Partial<ApiToken> = {},
): ApiToken {
  return {
    id: randomUUID(),
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    name: "Batch C token",
    secretHash: "hashed-secret",
    scopes: "files:read shares:write",
    expiresAt: null,
    lastUsedAt: null,
    lastUsedIp: null,
    revokedAt: null,
    userId: randomUUID(),
    ...overrides,
  };
}
