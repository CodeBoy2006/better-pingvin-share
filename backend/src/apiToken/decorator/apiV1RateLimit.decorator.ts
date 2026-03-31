import { SetMetadata } from "@nestjs/common";
import { ApiRateLimitPolicy } from "../apiToken.types";

export const API_V1_RATE_LIMIT_KEY = "api-v1-rate-limit";

export const ApiV1RateLimit = (policy: ApiRateLimitPolicy) =>
  SetMetadata(API_V1_RATE_LIMIT_KEY, policy);
