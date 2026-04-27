import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
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
  FILE_WEB_VIEW_SNIFF_BYTES,
  getFileWebViewDescriptor,
  getFileWebViewDescriptorFromSample,
} from "./fileWebView.util";
import { FileService } from "./file.service";
import { FileSecurityGuard } from "./guard/fileSecurity.guard";
import * as mime from "mime-types";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Expires: "0",
  Pragma: "no-cache",
  Vary: "Cookie",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

@Controller("shares/:shareId/files")
export class FileController {
  constructor(private fileService: FileService) {}

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
    res.set(PRIVATE_NO_STORE_HEADERS);

    const zipStream = await this.fileService.getZip(shareId);

    res.set({
      ...PRIVATE_NO_STORE_HEADERS,
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
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
  ) {
    return this.sendFileWebView(res, shareId, fileId);
  }

  private async sendFileWebView(
    res: Response,
    shareId: string,
    fileId: string,
  ) {
    res.set(PRIVATE_NO_STORE_HEADERS);

    const file = await this.fileService.get(shareId, fileId);
    const contentType =
      mime?.lookup?.(file.metaData.name) || "application/octet-stream";
    let descriptor = getFileWebViewDescriptor(file.metaData.name, contentType);

    if (!descriptor) {
      const sample = await this.fileService.readSample(
        shareId,
        fileId,
        FILE_WEB_VIEW_SNIFF_BYTES,
      );
      descriptor = getFileWebViewDescriptorFromSample(sample);
    }

    if (!descriptor) {
      throw new NotFoundException("Web view not available");
    }

    res.set({
      ...PRIVATE_NO_STORE_HEADERS,
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
    });

    return new StreamableFile(file.file);
  }

  @Get(":fileId")
  @UseGuards(FileSecurityGuard)
  async getFile(
    @Res({ passthrough: true }) res: Response,
    @Param("shareId") shareId: string,
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
    @Query("download") download = "true",
  ) {
    return this.sendFile(res, shareId, fileId, download);
  }

  private async sendFile(
    res: Response,
    shareId: string,
    fileId: string,
    download = "true",
  ) {
    res.set(PRIVATE_NO_STORE_HEADERS);

    const file = await this.fileService.get(shareId, fileId);

    const headers = {
      ...PRIVATE_NO_STORE_HEADERS,
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
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
    @Param("shareId") shareId: string,
  ) {
    await this.fileService.remove(shareId, fileId);
  }
}
