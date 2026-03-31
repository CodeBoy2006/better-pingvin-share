import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import { ApiPrincipal } from "src/apiToken/decorator/apiPrincipal.decorator";
import { ApiV1RateLimit } from "src/apiToken/decorator/apiV1RateLimit.decorator";
import { ApiPrincipalType } from "src/apiToken/apiToken.types";
import { API_V1_DEFAULT_RATE_LIMIT } from "src/apiToken/apiToken.constants";
import { ApiTokenGuard } from "src/apiToken/guard/apiToken.guard";
import { ApiV1ThrottlerGuard } from "src/apiToken/guard/apiV1Throttler.guard";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { ApiV1MeDTO } from "./dto/apiV1Me.dto";

@ApiTags("automation")
@ApiBearerAuth("api-token")
@SkipThrottle()
@UseGuards(ApiV1ThrottlerGuard, ApiTokenGuard)
@ApiV1RateLimit(API_V1_DEFAULT_RATE_LIMIT)
@Controller("v1")
export class ApiV1MeController {
  @Get("me")
  getCurrentUser(
    @GetUser() user: User,
    @ApiPrincipal() principal: ApiPrincipalType,
  ) {
    return new ApiV1MeDTO().from({
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      isLdap: !!user.ldapDN,
      hasPassword: !!user.password,
      totpVerified: user.totpVerified,
      tokenId: principal.tokenId,
      scopes: principal.scopes,
    });
  }
}
