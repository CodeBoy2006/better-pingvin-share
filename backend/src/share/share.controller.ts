import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import { User } from "@prisma/client";
import { Request, Response } from "express";
import moment from "moment";
import { GetUser } from "src/auth/decorator/getUser.decorator";
import { AdministratorGuard } from "src/auth/guard/isAdmin.guard";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { ConfigService } from "src/config/config.service";
import { canExposeFileWebView } from "src/file/fileWebView.util";
import * as mime from "mime-types";
import { AdminShareDTO } from "./dto/adminShare.dto";
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

function hasAnonymousOwnerAccess(value: object): value is {
  ownerToken: string;
  ownerManagementLink: string;
} {
  return "ownerToken" in value && "ownerManagementLink" in value;
}

@Controller("shares")
export class ShareController {
  constructor(
    private shareService: ShareService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  @Get("all")
  @UseGuards(JwtGuard, AdministratorGuard)
  async getAllShares() {
    return new AdminShareDTO().fromList(await this.shareService.getShares());
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
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      "Content-Type": "application/json; charset=utf-8",
      Expires: "0",
      Pragma: "no-cache",
      Vary: "Cookie",
      "X-Robots-Tag": "noindex, nofollow",
    });

    const shareToken = getShareTokenFromRequest(request, id);
    const user = this.getUserFromRequest(request);
    const fileList = await this.shareService.getFileList(id, {
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
    const appendTokenQuery = (url: string) =>
      tokenQuery ? `${url}${url.includes("?") ? "&" : "?"}${tokenQuery}` : url;

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

    return new ShareFileListDTO().from({
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
        zipDownloadUrl:
          fileList.share.isZipReady && fileList.share.files.length > 1
            ? appendTokenQuery(
                `${appUrl}/api/shares/${fileList.share.id}/files/zip`,
              )
            : undefined,
      },
      files: fileList.share.files.map((file) => {
        const contentType =
          mime.lookup(file.name) || "application/octet-stream";
        const fileUrl = `${appUrl}/api/shares/${fileList.share.id}/files/${file.id}`;

        return {
          id: file.id,
          name: file.name,
          sizeBytes: file.size,
          createdAt: file.createdAt,
          contentType,
          downloadUrl: appendTokenQuery(fileUrl),
          inlineUrl: appendTokenQuery(`${fileUrl}?download=false`),
          ...(includeWebViewLinks &&
          canExposeFileWebView(file.name, file.size, contentType)
            ? {
                webViewUrl: appendTokenQuery(`${fileUrl}/web`),
              }
            : {}),
        };
      }),
    });
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
    const token = await this.shareService.getShareToken(id, body.password);

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
