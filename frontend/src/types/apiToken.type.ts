export type ApiTokenScope =
  | "shares:read"
  | "shares:write"
  | "files:read"
  | "files:write"
  | "reverseShares:read"
  | "reverseShares:write";

export type ApiToken = {
  id: string;
  name: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  lastUsedIp?: string | null;
  revokedAt?: string | null;
};

export type CreatedApiToken = ApiToken & {
  token: string;
};

export type CreateApiToken = {
  name: string;
  scopes: ApiTokenScope[];
  expiresAt?: string;
};
