import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import contentDisposition from "content-disposition";
import { Request, Response } from "express";
import moment from "moment";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ConfigService } from "src/config/config.service";
import { FileService } from "src/file/file.service";
import {
  FILE_WEB_VIEW_SNIFF_BYTES,
  getFileWebViewDescriptor,
  getFileWebViewDescriptorFromSample,
} from "src/file/fileWebView.util";
import * as mime from "mime-types";
import { AdminShareDTO } from "./dto/adminShare.dto";
import { AdminShareAuditDTO } from "./dto/adminShareAudit.dto";
import { CompletedShareDTO } from "./dto/shareComplete.dto";
import { CreateShareDTO } from "./dto/createShare.dto";
import { MyShareDTO } from "./dto/myShare.dto";
import { ShareDTO } from "./dto/share.dto";
import { ShareFileListDTO } from "./dto/shareFileList.dto";
import { ShareMetaDataDTO } from "./dto/shareMetaData.dto";
import { SharePasswordDto } from "./dto/sharePassword.dto";
import { CreateShareGuard } from "./guard/createShare.guard";
import { ShareOwnerGuard } from "./guard/shareOwner.guard";
import { ShareSecurityGuard } from "./guard/shareSecurity.guard";
import { ShareTokenSecurity } from "./guard/shareTokenSecurity.guard";
import { getShareTokenFromRequest } from "./shareRequest.util";
import { ShareService } from "./share.service";

type ShareFileListEntry = {
  id: string;
  name: string;
  sizeBytes: string;
  createdAt: Date;
  contentType: string;
  downloadUrl: string;
  inlineUrl: string;
  webViewUrl?: string;
};

type ShareFileListResponse = {
  type: "pingvin-share-file-list";
  version: number;
  share: {
    id: string;
    name?: string;
    description?: string;
    expiration: Date;
    hasPassword: boolean;
    isZipReady: boolean;
    totalFiles: number;
    totalSizeBytes: string;
    url: string;
    machineReadableUrl: string;
    plainTextUrl: string;
    zipDownloadUrl?: string;
  };
  files: ShareFileListEntry[];
};

type ShareFileListResult = ShareFileListResponse & {
  shareToken?: string;
};

function hasAnonymousOwnerAccess(value: object): value is {
  ownerToken: string;
  ownerManagementLink: string;
} {
  return "ownerToken" in value && "ownerManagementLink" in value;
}

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Expires: "0",
  Pragma: "no-cache",
  Vary: "Cookie",
  "X-Robots-Tag": "noindex, nofollow",
} as const;

@Controller("shares")
export class ShareController {
  constructor(
    private shareService: ShareService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private fileService: FileService,
  ) {}

  @Get("all")
  @UseGuards(JwtGuard, AdministratorGuard)
  async getAllShares() {
    return new AdminShareDTO().fromList(await this.shareService.getShares());
  }

  @Get(":id/audit")
  @UseGuards(JwtGuard, AdministratorGuard)
  async getAdminAuditShare(
    @Param("id") id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set(PRIVATE_NO_STORE_HEADERS);

    return new AdminShareAuditDTO().from(
      await this.shareService.getAdminAuditShare(id),
    );
  }

  @Get(":id/audit/files/:fileId")
  @UseGuards(JwtGuard, AdministratorGuard)
  async getAdminAuditFile(
    @Param("id") id: string,
    @Param("fileId") fileId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set(PRIVATE_NO_STORE_HEADERS);

    const file = await this.shareService.getAdminAuditFile(id, fileId);

    response.set({
      ...PRIVATE_NO_STORE_HEADERS,
      "Content-Type":
        mime?.lookup?.(file.metaData.name) || "application/octet-stream",
      "Content-Length": file.metaData.size,
      "Content-Disposition": contentDisposition(file.metaData.name),
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
    });

    return new StreamableFile(file.file);
  }

  @Get()
  @UseGuards(JwtGuard)
  async getMyShares(@GetUser() user: User) {
    return new MyShareDTO().fromList(
      await this.shareService.getSharesByUser(user.id),
    );
  }

  @Get("stats/storage")
  @UseGuards(JwtGuard, AdministratorGuard)
  async getStorageStats() {
    return await this.shareService.getStorageStats();
  }

  @Get(":id")
  @UseGuards(ShareSecurityGuard)
  async get(@Param("id") id: string) {
    return new ShareDTO().from(await this.shareService.get(id));
  }

  @Get(":id/from-owner")
  @UseGuards(ShareOwnerGuard)
  async getFromOwner(@Param("id") id: string, @GetUser() user?: User) {
    return new ShareDTO().from(
      await this.shareService.getForOwner(id, user?.id),
    );
  }

  @Get(":id/metaData")
  @UseGuards(ShareSecurityGuard)
  async getMetaData(@Param("id") id: string) {
    return new ShareMetaDataDTO().from(await this.shareService.getMetaData(id));
  }

  @Get(":id/files.json")
  async getFileList(
    @Param("id") id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set({
      ...PRIVATE_NO_STORE_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    });

    return new ShareFileListDTO().from(
      await this.createShareFileListResponse(id, request, response),
    );
  }

  @Get(":id/files.txt")
  async getPlainTextFileList(
    @Param("id") id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set({
      ...PRIVATE_NO_STORE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    });

    const fileList = await this.createShareFileListResponse(
      id,
      request,
      response,
    );

    return this.createPlainTextFileList(fileList);
  }

  @Get(":id/file/:fileName")
  @UseGuards(ShareSecurityGuard)
  async getFileByName(
    @Param("id") id: string,
    @Param("fileName") fileName: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Query("download") download = "true",
  ) {
    response.set(PRIVATE_NO_STORE_HEADERS);

    const file = await this.getListedFileByName(
      id,
      fileName,
      request,
      response,
    );

    return this.sendListedFile(response, id, file, download);
  }

  @Get(":id/file/:fileName/web")
  @UseGuards(ShareSecurityGuard)
  async getFileWebViewByName(
    @Param("id") id: string,
    @Param("fileName") fileName: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set(PRIVATE_NO_STORE_HEADERS);

    const file = await this.getListedFileByName(
      id,
      fileName,
      request,
      response,
    );

    return this.sendListedFileWebView(response, id, file);
  }

  private async createShareFileListResponse(
    id: string,
    request: Request,
    response: Response,
  ): Promise<ShareFileListResult> {
    const shareToken = getShareTokenFromRequest(request, id);
    const user = this.getUserFromRequest(request);
    const fileList = await this.shareService.getFileList(id, request, {
      shareToken,
      userId: user?.sub,
      isAdmin: user?.isAdmin,
    });
    const appUrl = this.configService.get("general.appUrl");
    const shareTokenCookieKey = `share_${id}_token`;
    const currentShareToken = request.cookies?.[shareTokenCookieKey];
    const tokenQuery =
      fileList.share.hasPassword &&
      fileList.shareToken &&
      this.configService.get(
        "share.filesJsonPasswordProtectedLinksIncludeToken",
      )
        ? `token=${encodeURIComponent(fileList.shareToken)}`
        : undefined;
    const includeWebViewLinks = this.configService.get(
      "share.filesJsonWebViewLinksEnabled",
    );

    if (
      fileList.shareToken &&
      (!currentShareToken || currentShareToken !== fileList.shareToken)
    ) {
      this.clearShareTokenCookies(request, response);
      response.cookie(shareTokenCookieKey, fileList.shareToken, {
        path: "/",
        httpOnly: true,
      });
    }

    return {
      type: "pingvin-share-file-list",
      version: 1,
      share: {
        id: fileList.share.id,
        name: fileList.share.name,
        description: fileList.share.description,
        expiration: fileList.share.expiration,
        hasPassword: fileList.share.hasPassword,
        isZipReady: fileList.share.isZipReady,
        totalFiles: fileList.share.files.length,
        totalSizeBytes: fileList.share.files
          .reduce((total, file) => total + BigInt(file.size), BigInt(0))
          .toString(),
        url: `${appUrl}/s/${fileList.share.id}`,
        machineReadableUrl: `${appUrl}/s/${fileList.share.id}/files.json`,
        plainTextUrl: `${appUrl}/s/${fileList.share.id}/files.txt`,
        zipDownloadUrl:
          fileList.share.isZipReady && fileList.share.files.length > 1
            ? this.appendTokenQuery(
                `${appUrl}/api/shares/${fileList.share.id}/files/zip`,
                tokenQuery,
              )
            : undefined,
      },
      files: await Promise.all(
        fileList.share.files.map(async (file) => {
          const contentType =
            mime.lookup(file.name) || "application/octet-stream";
          const fileUrl = `${appUrl}/api/shares/${fileList.share.id}/files/${file.id}`;
          const descriptor = includeWebViewLinks
            ? await this.getShareFileWebViewDescriptor(
                fileList.share.id,
                file.id,
                file.name,
                contentType,
              )
            : undefined;

          return {
            id: file.id,
            name: file.name,
            sizeBytes: file.size,
            createdAt: file.createdAt,
            contentType,
            downloadUrl: this.appendTokenQuery(fileUrl, tokenQuery),
            inlineUrl: this.appendTokenQuery(
              `${fileUrl}?download=false`,
              tokenQuery,
            ),
            ...(descriptor
              ? {
                  webViewUrl: this.appendTokenQuery(
                    `${fileUrl}/web`,
                    tokenQuery,
                  ),
                }
              : {}),
          };
        }),
      ),
      shareToken: fileList.shareToken,
    };
  }

  private createPlainTextFileList(fileList: ShareFileListResult) {
    const tokenQuery =
      fileList.share.hasPassword &&
      fileList.shareToken &&
      this.configService.get(
        "share.filesJsonPasswordProtectedLinksIncludeToken",
      )
        ? `token=${encodeURIComponent(fileList.shareToken)}`
        : undefined;
    const lines = [
      "Pingvin Share File List",
      `Share: ${fileList.share.name || fileList.share.id}`,
      `URL: ${fileList.share.url}`,
      `Files: ${fileList.share.totalFiles}`,
      `Total size: ${fileList.share.totalSizeBytes} bytes`,
      "",
    ];

    for (const file of fileList.files) {
      lines.push(
        [
          this.normalizePlainTextField(file.name),
          this.normalizePlainTextField(file.contentType),
          `${file.sizeBytes} bytes`,
          this.appendTokenQuery(
            this.createPublicFileByNameUrl(fileList.share.id, file.name),
            tokenQuery,
          ),
          file.webViewUrl
            ? this.appendTokenQuery(
                `${this.createPublicFileByNameUrl(
                  fileList.share.id,
                  file.name,
                )}/web`,
                tokenQuery,
              )
            : "",
        ].join("\t"),
      );
    }

    return `${lines.join("\n")}\n`;
  }

  private decodePublicFileName(fileName: string) {
    try {
      return decodeURIComponent(fileName);
    } catch {
      return fileName;
    }
  }

  private normalizePlainTextField(value: string) {
    return value.replace(/[\r\n\t]+/g, " ").trim();
  }

  private async getListedFileByName(
    id: string,
    fileName: string,
    request: Request,
    response: Response,
  ) {
    const decodedFileName = this.decodePublicFileName(fileName);
    const fileList = await this.createShareFileListResponse(
      id,
      request,
      response,
    );
    const file = fileList.files.find((entry) => entry.name === decodedFileName);

    if (!file) {
      throw new NotFoundException("File not found");
    }

    return file;
  }

  private async sendListedFile(
    response: Response,
    shareId: string,
    file: ShareFileListEntry,
    download = "true",
  ) {
    const storedFile = await this.fileService.get(shareId, file.id);

    const headers = {
      ...PRIVATE_NO_STORE_HEADERS,
      "Content-Type": file.contentType,
      "Content-Length": file.sizeBytes,
      "Content-Security-Policy": "sandbox",
    };

    if (download === "true") {
      headers["Content-Disposition"] = contentDisposition(file.name);
    } else {
      headers["Content-Disposition"] = contentDisposition(file.name, {
        type: "inline",
      });
    }

    response.set(headers);

    return new StreamableFile(storedFile.file);
  }

  private async sendListedFileWebView(
    response: Response,
    shareId: string,
    file: ShareFileListEntry,
  ) {
    const storedFile = await this.fileService.get(shareId, file.id);
    const descriptor = await this.getShareFileWebViewDescriptor(
      shareId,
      file.id,
      file.name,
      file.contentType,
    );

    if (!descriptor) {
      throw new NotFoundException("Web view not available");
    }

    response.set({
      ...PRIVATE_NO_STORE_HEADERS,
      "Content-Disposition": contentDisposition(file.name, {
        type: "inline",
      }),
      "Content-Type":
        descriptor.kind === "image" ||
        descriptor.kind === "audio" ||
        descriptor.kind === "video" ||
        descriptor.kind === "pdf"
          ? descriptor.contentType || file.contentType
          : "text/plain; charset=utf-8",
      "Content-Length": file.sizeBytes,
      "X-Content-Type-Options": "nosniff",
    });

    return new StreamableFile(storedFile.file);
  }

  private createPublicFileByNameUrl(shareId: string, fileName: string) {
    const appUrl = this.configService.get("general.appUrl");
    return `${appUrl}/api/shares/${shareId}/file/${encodeURIComponent(
      fileName,
    )}`;
  }

  private appendTokenQuery(url: string, tokenQuery?: string) {
    return tokenQuery
      ? `${url}${url.includes("?") ? "&" : "?"}${tokenQuery}`
      : url;
  }

  private async getShareFileWebViewDescriptor(
    shareId: string,
    fileId: string,
    fileName: string,
    contentType: string | false,
  ) {
    const descriptor = getFileWebViewDescriptor(fileName, contentType);

    if (descriptor) {
      return descriptor;
    }

    const sample = await this.fileService.readSample(
      shareId,
      fileId,
      FILE_WEB_VIEW_SNIFF_BYTES,
    );

    return getFileWebViewDescriptorFromSample(sample);
  }

  @Post()
  @UseGuards(CreateShareGuard)
  async create(
    @Body() body: CreateShareDTO,
    @Req() request: Request,
    @GetUser() user: User,
  ) {
    const { reverse_share_token } = request.cookies;
    const share = await this.shareService.create(
      body,
      user,
      reverse_share_token,
    );
    return {
      ...new ShareDTO().from(share),
      ...(hasAnonymousOwnerAccess(share)
        ? {
            ownerToken: share.ownerToken,
            ownerManagementLink: share.ownerManagementLink,
          }
        : {}),
    };
  }

  @Post(":id/complete")
  @HttpCode(202)
  @UseGuards(CreateShareGuard, ShareOwnerGuard)
  async complete(@Param("id") id: string, @Req() request: Request) {
    const { reverse_share_token } = request.cookies;
    const share = await this.shareService.complete(id, reverse_share_token);
    return {
      ...new CompletedShareDTO().from(share),
      ...(hasAnonymousOwnerAccess(share)
        ? {
            ownerToken: share.ownerToken,
            ownerManagementLink: share.ownerManagementLink,
          }
        : {}),
    };
  }

  @Delete(":id/complete")
  @UseGuards(ShareOwnerGuard)
  async revertComplete(@Param("id") id: string) {
    return new ShareDTO().from(await this.shareService.revertComplete(id));
  }

  @Delete(":id")
  @UseGuards(ShareOwnerGuard)
  async remove(@Param("id") id: string, @GetUser() user?: User) {
    await this.shareService.remove(id, {
      isDeleterAdmin: user?.isAdmin === true,
      allowAnonymousOwner: !user,
    });
  }

  @Throttle({
    default: {
      limit: 10,
      ttl: 60,
    },
  })
  @Get("isShareIdAvailable/:id")
  async isShareIdAvailable(@Param("id") id: string) {
    return this.shareService.isShareIdAvailable(id);
  }

  @HttpCode(200)
  @Throttle({
    default: {
      limit: 20,
      ttl: 5 * 60,
    },
  })
  @UseGuards(ShareTokenSecurity)
  @Post(":id/token")
  async getShareToken(
    @Param("id") id: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: SharePasswordDto,
  ) {
    const token = await this.shareService.getShareToken(
      id,
      body.password,
      request,
    );

    this.clearShareTokenCookies(request, response);
    response.cookie(`share_${id}_token`, token, {
      path: "/",
      httpOnly: true,
    });

    return { token };
  }

  /**
   * Keeps the 10 most recent share token cookies and deletes the rest and all expired ones
   */
  private clearShareTokenCookies(request: Request, response: Response) {
    const shareTokenCookies = Object.entries(request.cookies)
      .filter(([key]) => key.startsWith("share_") && key.endsWith("_token"))
      .map(([key, value]) => ({
        key,
        payload: this.jwtService.decode(value),
      }));

    const expiredTokens = shareTokenCookies.filter(
      (cookie) => cookie.payload.exp < moment().unix(),
    );
    const validTokens = shareTokenCookies.filter(
      (cookie) => cookie.payload.exp >= moment().unix(),
    );

    expiredTokens.forEach((cookie) => response.clearCookie(cookie.key));

    if (validTokens.length > 10) {
      validTokens
        .sort((a, b) => a.payload.exp - b.payload.exp)
        .slice(0, -10)
        .forEach((cookie) => response.clearCookie(cookie.key));
    }
  }

  private getUserFromRequest(request: Request) {
    const accessToken = request.cookies.access_token;

    if (!accessToken) {
      return undefined;
    }

    try {
      return this.jwtService.verify<{ sub: string; isAdmin?: boolean }>(
        accessToken,
        {
          secret: this.configService.get("internal.jwtSecret"),
        },
      );
    } catch {
      return undefined;
    }
  }
}
