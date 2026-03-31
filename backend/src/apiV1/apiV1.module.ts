import { Module } from "@nestjs/common";
import { ApiTokenModule } from "src/apiToken/apiToken.module";
import { FileModule } from "src/file/file.module";
import { ReverseShareModule } from "src/reverseShare/reverseShare.module";
import { ShareModule } from "src/share/share.module";
import { ApiV1FileController } from "./apiV1.file.controller";
import { ApiV1MeController } from "./apiV1.me.controller";
import { ApiV1ReverseShareController } from "./apiV1.reverseShare.controller";
import { ApiV1ShareController } from "./apiV1.share.controller";

@Module({
  imports: [ApiTokenModule, ShareModule, FileModule, ReverseShareModule],
  controllers: [
    ApiV1MeController,
    ApiV1ShareController,
    ApiV1FileController,
    ApiV1ReverseShareController,
  ],
})
export class ApiV1Module {}
