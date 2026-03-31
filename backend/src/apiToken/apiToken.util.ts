import * as crypto from "crypto";
import {
  API_TOKEN_PREFIX,
  API_TOKEN_SCOPES,
  ApiTokenScope,
} from "./apiToken.constants";

export function parseApiToken(
  authorizationHeader?: string,
): { tokenId: string; secret: string } | null {
  if (!authorizationHeader) return null;

  const [scheme, credentials] = authorizationHeader.split(" ");

  if (!scheme || !credentials || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  const [prefixedTokenId, secret] = credentials.split(".");

  if (!prefixedTokenId || !secret) {
    return null;
  }

  const prefix = `${API_TOKEN_PREFIX}_`;

  if (!prefixedTokenId.startsWith(prefix)) {
    return null;
  }

  return {
    tokenId: prefixedTokenId.slice(prefix.length),
    secret,
  };
}

export function hashApiTokenSecret(secret: string, signingSecret: string) {
  return crypto
    .createHmac("sha256", signingSecret)
    .update(secret)
    .digest("hex");
}

export function normalizeApiTokenScopes(scopes: string[]): ApiTokenScope[] {
  return Array.from(new Set(scopes))
    .filter((scope): scope is ApiTokenScope =>
      API_TOKEN_SCOPES.includes(scope as ApiTokenScope),
    )
    .sort() as ApiTokenScope[];
}

export function serializeApiTokenScopes(scopes: string[]) {
  return normalizeApiTokenScopes(scopes).join(" ");
}

export function deserializeApiTokenScopes(scopes: string): ApiTokenScope[] {
  if (!scopes) return [];

  return normalizeApiTokenScopes(scopes.split(" "));
}
