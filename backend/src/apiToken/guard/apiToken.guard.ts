import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { ApiTokenService } from "../apiToken.service";
import { ApiTokenUsageService } from "../apiTokenUsage.service";

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    private apiTokenService: ApiTokenService,
    private apiTokenUsageService: ApiTokenUsageService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<
      Request & {
        apiPrincipal?: Awaited<
          ReturnType<ApiTokenService["validateAuthorizationHeader"]>
        >;
      }
    >();

    const apiPrincipal = await this.apiTokenService.validateAuthorizationHeader(
      request.headers.authorization,
    );

    request.apiPrincipal = apiPrincipal;
    request.user = apiPrincipal.user;

    const forwardedFor = request.headers["x-forwarded-for"];
    const ip =
      typeof forwardedFor === "string"
        ? forwardedFor.split(",")[0].trim()
        : request.ip;

    this.apiTokenUsageService.recordUsage(apiPrincipal.tokenId, ip);

    return true;
  }
}
