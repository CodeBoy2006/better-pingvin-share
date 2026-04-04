import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import contentDisposition from "content-disposition";
import { Response } from "express";
import { CreateShareGuard } from "src/share/guard/createShare.guard";
import { ShareOwnerGuard } from "src/share/guard/shareOwner.guard";
import {
  canExposeFileWebView,
  getFileWebViewDescriptor,
} from "./fileWebView.util";
import { FileService } from "./file.service";
import { FileSecurityGuard } from "./guard/fileSecurity.guard";
import * as mime from "mime-types";
import { Readable } from "stream";

@Controller("shares/:shareId/files")
export class FileController {
  constructor(private fileService: FileService) {}

  private async streamToBuffer(stream: Readable) {
    const chunks: Buffer[] = [];

    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  }

  @Post()
  @SkipThrottle()
  @UseGuards(CreateShareGuard, ShareOwnerGuard)
  async create(
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
    const { id, name, chunkIndex, totalChunks } = query;

    // Data can be empty if the file is empty
    return await this.fileService.create(
      body,
      { index: parseInt(chunkIndex), total: parseInt(totalChunks) },
      { id, name },
      shareId,
    );
  }

  @Get("zip")
  @UseGuards(FileSecurityGuard)
  async getZip(
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
  ) {
    const zipStream = await this.fileService.getZip(shareId);

    res.set({
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(`${shareId}.zip`),
    });

    return new StreamableFile(zipStream);
  }

  @Get(":fileId/web")
  @UseGuards(FileSecurityGuard)
  async getFileWebView(
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Param("fileId") fileId: string,
  ) {
    const file = await this.fileService.get(shareId, fileId);
    const contentType =
      mime?.lookup?.(file.metaData.name) || "application/octet-stream";

    if (
      !canExposeFileWebView(file.metaData.name, file.metaData.size, contentType)
    ) {
      throw new NotFoundException("Web view not available");
    }

    const descriptor = getFileWebViewDescriptor(file.metaData.name, contentType);

    if (!descriptor) {
      throw new NotFoundException("Web view not available");
    }

    res.set({
      "Cache-Control": "private, no-store",
      "Content-Disposition": contentDisposition(file.metaData.name, {
        type: "inline",
      }),
      "Content-Type":
        descriptor.kind === "image" ||
        descriptor.kind === "audio" ||
        descriptor.kind === "video" ||
        descriptor.kind === "pdf"
          ? descriptor.contentType || contentType
          : "text/plain; charset=utf-8",
      "Content-Length": file.metaData.size,
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    });

    if (
      descriptor.kind === "image" ||
      descriptor.kind === "audio" ||
      descriptor.kind === "video" ||
      descriptor.kind === "pdf"
    ) {
      return new StreamableFile(file.file);
    }

    const content = (await this.streamToBuffer(file.file)).toString("utf8");

    return content;
  }

  @Get(":fileId")
  @UseGuards(FileSecurityGuard)
  async getFile(
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Param("fileId") fileId: string,
    @Query("download") download = "true",
  ) {
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
  @SkipThrottle()
  @UseGuards(ShareOwnerGuard)
  async remove(
    @Param("fileId") fileId: string,
    @Param("shareId") shareId: string,
  ) {
    await this.fileService.remove(shareId, fileId);
  }
}
