import { Module } from "@nestjs/common";
import { AuthModule } from "src/auth/auth.module";
import { ApiTokenController } from "./apiToken.controller";
import { ApiTokenService } from "./apiToken.service";
import { ApiTokenUsageService } from "./apiTokenUsage.service";
import { ApiScopeGuard } from "./guard/apiScope.guard";
import { ApiTokenGuard } from "./guard/apiToken.guard";
import { ApiV1ThrottlerGuard } from "./guard/apiV1Throttler.guard";

@Module({
  imports: [AuthModule],
  controllers: [ApiTokenController],
  providers: [
    ApiTokenService,
    ApiTokenUsageService,
    ApiTokenGuard,
    ApiScopeGuard,
    ApiV1ThrottlerGuard,
  ],
  exports: [
    ApiTokenService,
    ApiTokenUsageService,
    ApiTokenGuard,
    ApiScopeGuard,
    ApiV1ThrottlerGuard,
  ],
})
export class ApiTokenModule {}
