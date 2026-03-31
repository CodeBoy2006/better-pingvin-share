import { SetMetadata } from "@nestjs/common";
import { ApiTokenScope } from "../apiToken.constants";

export const API_TOKEN_SCOPES_KEY = "api-token-scopes";

export const ApiScopes = (...scopes: ApiTokenScope[]) =>
  SetMetadata(API_TOKEN_SCOPES_KEY, scopes);
