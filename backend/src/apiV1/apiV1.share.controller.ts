import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import {
  API_V1_DEFAULT_RATE_LIMIT,
} from "src/apiToken/apiToken.constants";
import { ApiScopes } from "src/apiToken/decorator/apiScopes.decorator";
import { ApiV1RateLimit } from "src/apiToken/decorator/apiV1RateLimit.decorator";
import { ApiScopeGuard } from "src/apiToken/guard/apiScope.guard";
import { ApiTokenGuard } from "src/apiToken/guard/apiToken.guard";
import { ApiV1ThrottlerGuard } from "src/apiToken/guard/apiV1Throttler.guard";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { CreateShareDTO } from "src/share/dto/createShare.dto";
import { UpdateShareDTO } from "src/share/dto/updateShare.dto";
import { ShareService } from "src/share/share.service";
import { ApiV1ShareDTO } from "./dto/apiV1Share.dto";

@ApiTags("automation")
@ApiBearerAuth("api-token")
@SkipThrottle()
@UseGuards(ApiV1ThrottlerGuard, ApiTokenGuard, ApiScopeGuard)
@ApiV1RateLimit(API_V1_DEFAULT_RATE_LIMIT)
@Controller("v1/shares")
export class ApiV1ShareController {
  constructor(private shareService: ShareService) {}

  @Get()
  @ApiScopes("shares:read")
  async list(@GetUser() user: User) {
    return new ApiV1ShareDTO().fromList(
      await this.shareService.getDetailedSharesByOwner(user.id),
    );
  }

  @Post()
  @ApiScopes("shares:write")
  async create(@GetUser() user: User, @Body() body: CreateShareDTO) {
    const share = await this.shareService.create(body, user);
    return new ApiV1ShareDTO().from(
      await this.shareService.getDetailedShareByOwner(share.id, user.id),
    );
  }

  @Get(":id")
  @ApiScopes("shares:read")
  async get(@GetUser() user: User, @Param("id") id: string) {
    return new ApiV1ShareDTO().from(
      await this.shareService.getDetailedShareByOwner(id, user.id),
    );
  }

  @Patch(":id")
  @ApiScopes("shares:write")
  async update(
    @GetUser() user: User,
    @Param("id") id: string,
    @Body() body: UpdateShareDTO,
  ) {
    return new ApiV1ShareDTO().from(
      await this.shareService.update(id, body, {
        userId: user.id,
        isAdmin: false,
      }),
    );
  }

  @Post(":id/complete")
  @HttpCode(202)
  @ApiScopes("shares:write")
  async complete(@GetUser() user: User, @Param("id") id: string) {
    await this.shareService.assertShareOwnership(id, user.id);
    await this.shareService.assertShareFilesMutable(id, user.id);
    await this.shareService.complete(id);

    return new ApiV1ShareDTO().from(
      await this.shareService.getDetailedShareByOwner(id, user.id),
    );
  }

  @Delete(":id/complete")
  @ApiScopes("shares:write")
  async revertComplete(@GetUser() user: User, @Param("id") id: string) {
    await this.shareService.assertShareOwnership(id, user.id);
    await this.shareService.assertShareFilesMutable(id, user.id);
    await this.shareService.revertComplete(id);

    return new ApiV1ShareDTO().from(
      await this.shareService.getDetailedShareByOwner(id, user.id),
    );
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiScopes("shares:write")
  async remove(@GetUser() user: User, @Param("id") id: string) {
    await this.shareService.assertShareOwnership(id, user.id);
    await this.shareService.remove(id);
  }
}
