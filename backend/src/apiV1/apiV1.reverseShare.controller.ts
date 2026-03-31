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
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import {
  API_V1_DEFAULT_RATE_LIMIT,
} from "src/apiToken/apiToken.constants";
import { ApiScopes } from "src/apiToken/decorator/apiScopes.decorator";
import { ApiV1RateLimit } from "src/apiToken/decorator/apiV1RateLimit.decorator";
import { ApiScopeGuard } from "src/apiToken/guard/apiScope.guard";
import { ApiTokenGuard } from "src/apiToken/guard/apiToken.guard";
import { ApiV1ThrottlerGuard } from "src/apiToken/guard/apiV1Throttler.guard";
import { ConfigService } from "src/config/config.service";
import { CreateReverseShareDTO } from "src/reverseShare/dto/createReverseShare.dto";
import { ReverseShareTokenWithShares } from "src/reverseShare/dto/reverseShareTokenWithShares";
import { ReverseShareService } from "src/reverseShare/reverseShare.service";

@ApiTags("automation")
@ApiBearerAuth("api-token")
@SkipThrottle()
@UseGuards(ApiV1ThrottlerGuard, ApiTokenGuard, ApiScopeGuard)
@ApiV1RateLimit(API_V1_DEFAULT_RATE_LIMIT)
@Controller("v1/reverse-shares")
export class ApiV1ReverseShareController {
  constructor(
    private reverseShareService: ReverseShareService,
    private config: ConfigService,
  ) {}

  @Get()
  @ApiScopes("reverseShares:read")
  async list(@GetUser() user: User) {
    return new ReverseShareTokenWithShares().fromList(
      await this.reverseShareService.getAllByUser(user.id),
    );
  }

  @Post()
  @ApiScopes("reverseShares:write")
  async create(@GetUser() user: User, @Body() body: CreateReverseShareDTO) {
    const token = await this.reverseShareService.create(body, user.id);

    return {
      token,
      link: `${this.config.get("general.appUrl")}/upload/${token}`,
    };
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiScopes("reverseShares:write")
  async remove(@GetUser() user: User, @Param("id") id: string) {
    await this.reverseShareService.getByIdAndOwner(id, user.id);
    await this.reverseShareService.remove(id);
  }
}
