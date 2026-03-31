export const API_TOKEN_PREFIX = "psk";

export const API_TOKEN_SCOPES = [
  "shares:read",
  "shares:write",
  "files:read",
  "files:write",
  "reverseShares:read",
  "reverseShares:write",
] as const;

export const API_TOKEN_USAGE_WINDOW_MS = 5 * 60 * 1000;

export const API_V1_DEFAULT_RATE_LIMIT = {
  name: "resource",
  limit: 300,
  ttlSeconds: 60,
};

export const API_V1_CHUNK_RATE_LIMIT = {
  name: "chunk-upload",
  limit: 1200,
  ttlSeconds: 60,
};

export const API_V1_MULTIPART_RATE_LIMIT = {
  name: "multipart-upload",
  limit: 120,
  ttlSeconds: 60,
};

export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number];
