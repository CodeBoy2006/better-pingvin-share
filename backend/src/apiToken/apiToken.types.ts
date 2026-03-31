import { User } from "@prisma/client";
import { ApiTokenScope } from "./apiToken.constants";

export type ApiPrincipalType = {
  tokenId: string;
  scopes: ApiTokenScope[];
  user: User;
};

export type ApiRateLimitPolicy = {
  name: string;
  limit: number;
  ttlSeconds: number;
};
