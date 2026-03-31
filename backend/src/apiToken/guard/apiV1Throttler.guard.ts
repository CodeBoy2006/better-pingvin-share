import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Request } from "express";
import { API_V1_RATE_LIMIT_KEY } from "../decorator/apiV1RateLimit.decorator";
import { ApiRateLimitPolicy } from "../apiToken.types";
import { parseApiToken } from "../apiToken.util";

@Injectable()
export class ApiV1ThrottlerGuard implements CanActivate {
  private readonly requests = new Map<string, number[]>();

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.method === "OPTIONS") {
      return true;
    }

    const policy = this.reflector.getAllAndOverride<ApiRateLimitPolicy>(
      API_V1_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!policy) return true;

    const now = Date.now();
    const ttlMs = policy.ttlSeconds * 1000;
    const identifier = this.buildIdentifier(request, policy.name);
    const timestamps = (this.requests.get(identifier) ?? []).filter(
      (timestamp) => timestamp > now - ttlMs,
    );

    if (timestamps.length >= policy.limit) {
      throw new HttpException("Too many requests", 429);
    }

    timestamps.push(now);
    this.requests.set(identifier, timestamps);

    return true;
  }

  private buildIdentifier(request: Request, policyName: string) {
    const parsedToken = parseApiToken(request.headers.authorization);
    const forwardedFor = request.headers["x-forwarded-for"];
    const ip =
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0].trim()
        : request.ip;

    return `${policyName}:${parsedToken?.tokenId ?? ip ?? "unknown"}`;
  }
}
