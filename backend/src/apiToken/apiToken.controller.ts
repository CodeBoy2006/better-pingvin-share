import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiCookieAuth, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { SessionJwtGuard } from "src/auth/guard/sessionJwt.guard";
import { ApiV1RateLimit } from "./decorator/apiV1RateLimit.decorator";
import { ApiTokenDTO } from "./dto/apiToken.dto";
import { CreateApiTokenDTO } from "./dto/createApiToken.dto";
import { CreatedApiTokenDTO } from "./dto/createdApiToken.dto";
import { ApiTokenService } from "./apiToken.service";
import { API_V1_DEFAULT_RATE_LIMIT } from "./apiToken.constants";
import { ApiV1ThrottlerGuard } from "./guard/apiV1Throttler.guard";

@ApiTags("automation")
@ApiCookieAuth("web-session")
@SkipThrottle()
@UseGuards(ApiV1ThrottlerGuard)
@ApiV1RateLimit(API_V1_DEFAULT_RATE_LIMIT)
@Controller("v1/tokens")
export class ApiTokenController {
  constructor(private apiTokenService: ApiTokenService) {}

  @Get()
  @UseGuards(SessionJwtGuard)
  async list(@GetUser() user: User) {
    return new ApiTokenDTO().fromList(
      await this.apiTokenService.listByUser(user.id),
    );
  }

  @Post()
  @UseGuards(SessionJwtGuard)
  async create(@GetUser() user: User, @Body() body: CreateApiTokenDTO) {
    return new CreatedApiTokenDTO().from(
      await this.apiTokenService.createForUser({
        userId: user.id,
        name: body.name,
        scopes: body.scopes,
        expiresAt: body.expiresAt,
      }),
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @UseGuards(SessionJwtGuard)
  async revoke(@GetUser() user: User, @Param("id") id: string) {
    await this.apiTokenService.revokeForUser(id, user.id);
  }
}
