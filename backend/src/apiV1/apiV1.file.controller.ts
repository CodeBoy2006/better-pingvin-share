import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { SkipThrottle } from "@nestjs/throttler";
import contentDisposition from "content-disposition";
import { Response } from "express";
import * as mime from "mime-types";
import { User } from "@prisma/client";
import {
  API_V1_CHUNK_RATE_LIMIT,
  API_V1_DEFAULT_RATE_LIMIT,
  API_V1_MULTIPART_RATE_LIMIT,
} from "src/apiToken/apiToken.constants";
import { ApiScopes } from "src/apiToken/decorator/apiScopes.decorator";
import { ApiV1RateLimit } from "src/apiToken/decorator/apiV1RateLimit.decorator";
import { ApiScopeGuard } from "src/apiToken/guard/apiScope.guard";
import { ApiTokenGuard } from "src/apiToken/guard/apiToken.guard";
import { ApiV1ThrottlerGuard } from "src/apiToken/guard/apiV1Throttler.guard";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { FileService } from "src/file/file.service";
import { ShareService } from "src/share/share.service";

@ApiTags("automation")
@ApiBearerAuth("api-token")
@SkipThrottle()
@UseGuards(ApiV1ThrottlerGuard, ApiTokenGuard, ApiScopeGuard)
@ApiV1RateLimit(API_V1_DEFAULT_RATE_LIMIT)
@Controller("v1/shares/:shareId/files")
export class ApiV1FileController {
  constructor(
    private fileService: FileService,
    private shareService: ShareService,
  ) {}

  @Post()
  @ApiScopes("files:write")
  @ApiV1RateLimit(API_V1_CHUNK_RATE_LIMIT)
  @ApiConsumes("application/octet-stream")
  async createChunk(
    @GetUser() user: User,
    @Query()
    query: {
      id: string;
      name: string;
      chunkIndex: string;
      totalChunks: string;
    },
    @Body() body: string,
    @Param("shareId") shareId: string,
  ) {
    await this.shareService.assertShareOwnership(shareId, user.id);

    const { id, name, chunkIndex, totalChunks } = query;

    return await this.fileService.create(
      body,
      { index: parseInt(chunkIndex), total: parseInt(totalChunks) },
      { id, name },
      shareId,
    );
  }

  @Post("multipart")
  @ApiScopes("files:write")
  @ApiV1RateLimit(API_V1_MULTIPART_RATE_LIMIT)
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: {
        file: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 50 * 1024 * 1024,
      },
    }),
  )
  async createMultipart(
    @GetUser() user: User,
    @Param("shareId") shareId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    await this.shareService.assertShareOwnership(shareId, user.id);

    if (!file) {
      throw new BadRequestException("File is required");
    }

    return await this.fileService.create(
      file.buffer.toString("base64"),
      { index: 0, total: 1 },
      { name: file.originalname },
      shareId,
    );
  }

  @Get("zip")
  @ApiScopes("files:read")
  @ApiProduces("application/zip")
  async getZip(
    @GetUser() user: User,
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
  ) {
    await this.shareService.assertShareOwnership(shareId, user.id);

    const zipStream = await this.fileService.getZipForOwner(shareId);

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`${shareId}.zip`),
    });

    return new StreamableFile(zipStream);
  }

  @Get(":fileId")
  @ApiScopes("files:read")
  async getFile(
    @GetUser() user: User,
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Param("fileId") fileId: string,
    @Query("download") download = "true",
  ) {
    await this.shareService.assertShareOwnership(shareId, user.id);
    const file = await this.fileService.get(shareId, fileId);

    const headers = {
      "Content-Type":
        mime?.lookup?.(file.metaData.name) || "application/octet-stream",
      "Content-Length": file.metaData.size,
      "Content-Security-Policy": "sandbox",
    };

    if (download === "true") {
      headers["Content-Disposition"] = contentDisposition(file.metaData.name);
    } else {
      headers["Content-Disposition"] = contentDisposition(file.metaData.name, {
        type: "inline",
      });
    }

    res.set(headers);

    return new StreamableFile(file.file);
  }

  @Delete(":fileId")
  @HttpCode(204)
  @ApiScopes("files:write")
  async remove(
    @GetUser() user: User,
    @Param("shareId") shareId: string,
    @Param("fileId") fileId: string,
  ) {
    await this.shareService.assertShareOwnership(shareId, user.id);
    await this.fileService.remove(shareId, fileId);
  }
}
