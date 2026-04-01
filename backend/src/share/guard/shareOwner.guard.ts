import {
  ExecutionContext,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { User } from "@prisma/client";
import { Request } from "express";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { ShareService } from "../share.service";
import { JwtGuard } from "../../auth/guard/jwt.guard";

@Injectable()
export class ShareOwnerGuard extends JwtGuard {
  constructor(
    configService: ConfigService,
    private prisma: PrismaService,
    private shareService: ShareService,
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

    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      include: { security: true },
    });

    if (!share) throw new NotFoundException("Share not found");

    // Run the JWTGuard to set the user
    await super.canActivate(context);
    const user = request.user as User;

    // If the user is an admin, allow access
    if (user?.isAdmin) return true;

    // Anonymous shares require a dedicated owner capability token.
    if (!share.creatorId) {
      const ownerToken = request.cookies[`share_${shareId}_owner_token`];
      if (!ownerToken) return false;

      return await this.shareService.verifyShareOwnerToken(shareId, ownerToken);
    }

    // If not signed in, deny access
    if (!user) return false;

    // If the user is the creator of the share, allow access
    return share.creatorId == user.id;
  }
}
