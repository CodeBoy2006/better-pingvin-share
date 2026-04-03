import type { ApiToken } from "../src/types/apiToken.type";
import type { FileMetaData } from "../src/types/File.type";
import type { AdminConfig } from "../src/types/config.type";
import type { MyReverseShare, MyShare, Share } from "../src/types/share.type";
import type { CurrentUser } from "../src/types/user.type";

export const createConfig = (
  overrides: Partial<AdminConfig> & Pick<AdminConfig, "key" | "type">,
): AdminConfig => {
  const { key, type, ...rest } = overrides;
  const defaultValue =
    rest.defaultValue ??
    (type === "boolean"
      ? "false"
      : type === "number" || type === "filesize"
        ? "0"
        : type === "timespan"
          ? "7-days"
          : "");

  return {
    allowEdit: true,
    defaultValue,
    description: "",
    key,
    name: key,
    obscured: false,
    secret: false,
    type,
    updatedAt: new Date(),
    value: rest.value ?? defaultValue,
    ...rest,
  };
};

export const createUser = (
  overrides: Partial<CurrentUser> = {},
): CurrentUser => ({
  email: "demo@example.com",
  hasPassword: true,
  id: "user-1",
  isAdmin: false,
  isLdap: false,
  totpVerified: false,
  username: "demo",
  ...overrides,
});

export const createFileMeta = (
  overrides: Partial<FileMetaData> = {},
): FileMetaData => ({
  id: "file-1",
  name: "notes.txt",
  size: "12",
  ...overrides,
});

export const createShare = (overrides: Partial<Share> = {}): Share => ({
  description: "Shared files",
  expiration: new Date("2026-01-01T00:00:00.000Z"),
  files: [createFileMeta()],
  hasPassword: false,
  id: "share-1",
  name: "Quarterly report",
  size: 12,
  ...overrides,
});

export const createMyShare = (overrides: Partial<MyShare> = {}): MyShare => ({
  ...createShare(),
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  security: {
    maxViews: 0,
    passwordProtected: false,
  },
  views: 0,
  ...overrides,
});

export const createReverseShare = (
  overrides: Partial<MyReverseShare> = {},
): MyReverseShare => ({
  id: "reverse-share-1",
  maxShareSize: "1048576",
  remainingUses: 3,
  shareExpiration: new Date("2026-01-01T00:00:00.000Z"),
  shares: [],
  token: "reverse-token",
  ...overrides,
});

export const createApiToken = (
  overrides: Partial<ApiToken> = {},
): ApiToken => ({
  createdAt: "2026-01-01T00:00:00.000Z",
  expiresAt: null,
  id: "token-1",
  lastUsedAt: null,
  lastUsedIp: null,
  name: "CI deploy token",
  revokedAt: null,
  scopes: ["shares:read"],
  ...overrides,
});
