import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Request } from "express";
import { PrismaService } from "src/prisma/prisma.service";
import { ShareService } from "src/share/share.service";
import { ConfigService } from "src/config/config.service";
import { JwtGuard } from "src/auth/guard/jwt.guard";
import { User } from "@prisma/client";
import { getShareTokenFromRequest } from "../shareRequest.util";
import { isShareExpired, isShareRemoved } from "../shareAccess.util";

@Injectable()
export class ShareSecurityGuard extends JwtGuard {
  constructor(
    private shareService: ShareService,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    super(configService);
  }

  async canActivate(context: ExecutionContext) {
    const request: Request = context.switchToHttp().getRequest();

    const shareId = Object.prototype.hasOwnProperty.call(
      request.params,
      "shareId",
    )
      ? request.params.shareId
      : request.params.id;

    const shareToken = getShareTokenFromRequest(request, shareId);
    const hasShareToken = !!shareToken;

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: {
        security: {
          include: {
            allowedIps: true,
            assignedIps: true,
          },
        },
        reverseShare: true,
      },
    });

    if (!share) throw new NotFoundException("Share not found");

    if (isShareRemoved(share)) {
      throw new NotFoundException(share.removedReason, "share_removed");
    }

    if (isShareExpired(share)) {
      throw new NotFoundException("Share not found");
    }

    const user = await this.getAuthenticatedUser(context);

    if (
      user?.isAdmin &&
      this.configService.get("share.allowAdminAccessAllShares")
    ) {
      return true;
    }

    // Only the creator and reverse share creator can access the reverse share if it's not public
    if (
      share.reverseShare &&
      !share.reverseShare.publicAccess &&
      share.creatorId !== user?.id &&
      share.reverseShare.creatorId !== user?.id
    )
      throw new ForbiddenException(
        "Only reverse share creator can access this share",
        "private_share",
      );

    if (share.security?.password && !shareToken) {
      await this.shareService.assertShareIpAccess(share, request);

      throw new ForbiddenException(
        "This share is password protected",
        "share_password_required",
      );
    }

    if (
      hasShareToken &&
      !(await this.shareService.verifyShareToken(shareId, shareToken))
    )
      throw new ForbiddenException(
        "Share token required",
        "share_token_required",
      );

    if (hasShareToken) {
      await this.shareService.assertShareIpAccess(share, request, {
        assignIfNeeded: true,
      });
    } else {
      if (share.security?.maxViews && share.security.maxViews <= share.views) {
        throw new ForbiddenException(
          "Maximum views exceeded",
          "share_max_views_exceeded",
        );
      }

      await this.shareService.assertShareIpAccess(share, request, {
        assignIfNeeded: true,
      });
      await this.shareService.increaseViewCount(share);
    }

    return true;
  }

  protected async getAuthenticatedUser(context: ExecutionContext) {
    await JwtGuard.prototype.canActivate.call(this, context);
    const request: Request = context.switchToHttp().getRequest();
    return request.user as User | undefined;
  }
}
