import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { Share, User } from "@prisma/client";
import archiver from "archiver";
import * as argon from "argon2";
import * as fs from "fs";
import * as fsPromises from "fs/promises";
import moment from "moment";
import { ClamScanService } from "src/clamscan/clamscan.service";
import { ConfigService } from "src/config/config.service";
import { EmailService } from "src/email/email.service";
import { FileService } from "src/file/file.service";
import { PrismaService } from "src/prisma/prisma.service";
import { ReverseShareService } from "src/reverseShare/reverseShare.service";
import { parseRelativeDateToAbsolute } from "src/utils/date.util";
import { SHARE_DIRECTORY } from "../constants";
import { CreateShareDTO } from "./dto/createShare.dto";
import { isShareExpired, isShareRemoved } from "./shareAccess.util";

@Injectable()
export class ShareService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private fileService: FileService,
    private emailService: EmailService,
    private config: ConfigService,
    private jwtService: JwtService,
    private reverseShareService: ReverseShareService,
    private clamScanService: ClamScanService,
  ) {}

  async create(share: CreateShareDTO, user?: User, reverseShareToken?: string) {
    if (!(await this.isShareIdAvailable(share.id)).isAvailable)
      throw new BadRequestException("Share id already in use");

    if (!share.security || Object.keys(share.security).length == 0)
      share.security = undefined;

    if (share.security?.password) {
      share.security.password = await argon.hash(share.security.password);
    }

    let expirationDate: Date;

    // If share is created by a reverse share token override the expiration date
    const reverseShare =
      await this.reverseShareService.getByToken(reverseShareToken);
    if (reverseShare) {
      expirationDate = reverseShare.shareExpiration;
    } else {
      const parsedExpiration = parseRelativeDateToAbsolute(share.expiration);

      const expiresNever = moment(0).toDate() == parsedExpiration;

      const maxExpiration = this.config.get("share.maxExpiration");
      if (
        maxExpiration.value !== 0 &&
        (expiresNever ||
          parsedExpiration >
            moment().add(maxExpiration.value, maxExpiration.unit).toDate())
      ) {
        throw new BadRequestException(
          "Expiration date exceeds maximum expiration date",
        );
      }

      expirationDate = parsedExpiration;
    }

    fs.mkdirSync(`${SHARE_DIRECTORY}/${share.id}`, {
      recursive: true,
    });

    const shareTuple = await this.prisma.share.create({
      data: {
        ...share,
        expiration: expirationDate,
        creator: { connect: user ? { id: user.id } : undefined },
        security: { create: share.security },
        recipients: {
          create: share.recipients
            ? share.recipients.map((email) => ({ email }))
            : [],
        },
        storageProvider: this.configService.get("s3.enabled") ? "S3" : "LOCAL",
      },
    });

    if (reverseShare) {
      // Assign share to reverse share token
      await this.prisma.reverseShare.update({
        where: { token: reverseShareToken },
        data: {
          shares: {
            connect: { id: shareTuple.id },
          },
        },
      });
    }

    if (!shareTuple.creatorId) {
      return {
        ...shareTuple,
        ...(await this.getAnonymousOwnerAccess(shareTuple.id)),
      };
    }

    return shareTuple;
  }

  async createZip(shareId: string) {
    if (this.config.get("s3.enabled")) return;

    const path = `${SHARE_DIRECTORY}/${shareId}`;

    const files = await this.prisma.file.findMany({ where: { shareId } });
    const archive = archiver("zip", {
      zlib: { level: this.config.get("share.zipCompressionLevel") },
    });
    const writeStream = fs.createWriteStream(`${path}/archive.zip`);

    for (const file of files) {
      archive.append(fs.createReadStream(`${path}/${file.id}`), {
        name: file.name,
      });
    }

    archive.pipe(writeStream);
    await archive.finalize();
  }

  async complete(id: string, reverseShareToken?: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        files: true,
        recipients: true,
        creator: true,
        reverseShare: { include: { creator: true } },
      },
    });

    if (await this.isShareCompleted(id))
      throw new BadRequestException("Share already completed");

    if (share.files.length == 0)
      throw new BadRequestException(
        "You need at least on file in your share to complete it.",
      );

    // Asynchronously create a zip of all files
    if (share.files.length > 1)
      this.createZip(id).then(() =>
        this.prisma.share.update({ where: { id }, data: { isZipReady: true } }),
      );

    // Send email for each recipient
    for (const recipient of share.recipients) {
      await this.emailService.sendMailToShareRecipients(
        recipient.email,
        share.id,
        share.creator,
        share.description,
        share.expiration,
      );
    }

    const notifyReverseShareCreator = share.reverseShare
      ? this.config.get("smtp.enabled") &&
        share.reverseShare.sendEmailNotification
      : undefined;

    if (notifyReverseShareCreator) {
      await this.emailService.sendMailToReverseShareCreator(
        share.reverseShare.creator.email,
        share.id,
      );
    }

    // Check if any file is malicious with ClamAV
    void this.clamScanService.checkAndRemove(share.id);

    if (share.reverseShare) {
      await this.prisma.reverseShare.update({
        where: { token: reverseShareToken },
        data: { remainingUses: { decrement: 1 } },
      });
    }

    const updatedShare = await this.prisma.share.update({
      where: { id },
      data: { uploadLocked: true },
    });

    const result = {
      ...updatedShare,
      notifyReverseShareCreator,
    };

    if (!share.creatorId) {
      return {
        ...result,
        ...(await this.getAnonymousOwnerAccess(id)),
      };
    }

    return result;
  }

  async revertComplete(id: string) {
    return this.prisma.share.update({
      where: { id },
      data: { uploadLocked: false, isZipReady: false },
    });
  }

  async getShares() {
    const shares = await this.prisma.share.findMany({
      orderBy: {
        expiration: "desc",
      },
      include: { files: true, creator: true },
    });

    return shares.map((share) => {
      return {
        ...share,
        size: share.files.reduce((acc, file) => acc + parseInt(file.size), 0),
      };
    });
  }

  async getStorageStats() {
    const shares = await this.prisma.share.findMany({
      select: {
        id: true,
        storageProvider: true,
        files: {
          select: {
            size: true,
          },
        },
      },
    });

    const totalShareSizeBytes = shares.reduce(
      (shareTotal, share) =>
        shareTotal +
        share.files.reduce(
          (fileTotal, file) => fileTotal + parseInt(file.size),
          0,
        ),
      0,
    );

    const storageProvider = this.configService.get("s3.enabled")
      ? "S3"
      : "LOCAL";

    if (storageProvider === "S3") {
      return {
        shareCount: shares.length,
        storageProvider,
        totalShareSizeBytes,
        disk: null,
      };
    }

    await fsPromises.mkdir(SHARE_DIRECTORY, { recursive: true });
    const diskStats = await fsPromises.statfs(SHARE_DIRECTORY);
    const totalBytes = diskStats.blocks * diskStats.bsize;
    const availableBytes = diskStats.bavail * diskStats.bsize;
    const usedBytes = totalBytes - diskStats.bfree * diskStats.bsize;

    return {
      shareCount: shares.length,
      storageProvider,
      totalShareSizeBytes,
      disk: {
        totalBytes,
        availableBytes,
        usedBytes,
      },
    };
  }

  async getSharesByUser(userId: string) {
    const shares = await this.prisma.share.findMany({
      where: {
        creator: { id: userId },
        uploadLocked: true,
        // We want to grab any shares that are not expired or have their expiration date set to "never" (unix 0)
        OR: [
          { expiration: { gt: new Date() } },
          { expiration: { equals: moment(0).toDate() } },
        ],
      },
      orderBy: {
        expiration: "desc",
      },
      include: { recipients: true, files: true, security: true },
    });

    return shares.map((share) => {
      return {
        ...share,
        size: share.files.reduce((acc, file) => acc + parseInt(file.size), 0),
        recipients: share.recipients.map((recipients) => recipients.email),
        security: {
          maxViews: share.security?.maxViews,
          passwordProtected: !!share.security?.password,
        },
      };
    });
  }

  async get(id: string): Promise<any> {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        files: {
          orderBy: {
            name: "asc",
          },
        },
        creator: true,
        security: true,
      },
    });

    if (isShareRemoved(share))
      throw new NotFoundException(share.removedReason, "share_removed");

    if (!share || !share.uploadLocked)
      throw new NotFoundException("Share not found");
    return {
      ...share,
      hasPassword: !!share.security?.password,
    };
  }

  async getForOwner(id: string, userId?: string): Promise<any> {
    const share = await this.getOwnerShareEntity(id, userId);

    return {
      ...share,
      hasPassword: !!share.security?.password,
      size: share.files.reduce((acc, file) => acc + parseInt(file.size), 0),
    };
  }

  async getFileList(
    id: string,
    options?: { shareToken?: string; userId?: string; isAdmin?: boolean },
  ) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        files: {
          orderBy: {
            name: "asc",
          },
        },
        security: true,
        reverseShare: true,
      },
    });

    if (!share || !share.uploadLocked) {
      throw new NotFoundException("Share not found");
    }

    if (isShareRemoved(share)) {
      throw new NotFoundException(share.removedReason, "share_removed");
    }

    if (isShareExpired(share)) {
      throw new NotFoundException("Share not found");
    }

    const hasAdminAccess =
      options?.isAdmin &&
      this.configService.get("share.allowAdminAccessAllShares");

    if (
      !hasAdminAccess &&
      share.reverseShare &&
      !share.reverseShare.publicAccess &&
      share.creatorId !== options?.userId &&
      share.reverseShare.creatorId !== options?.userId
    ) {
      throw new ForbiddenException(
        "Only reverse share creator can access this share",
        "private_share",
      );
    }

    const hasValidShareToken =
      options?.shareToken != undefined &&
      (await this.verifyShareToken(id, options.shareToken));

    if (!hasAdminAccess && !hasValidShareToken && share.security?.password) {
      throw new ForbiddenException(
        options?.shareToken
          ? "Share token required"
          : "This share is password protected",
        options?.shareToken
          ? "share_token_required"
          : "share_password_required",
      );
    }

    if (!hasAdminAccess && !hasValidShareToken) {
      if (share.security?.maxViews && share.security.maxViews <= share.views) {
        throw new ForbiddenException(
          "Maximum views exceeded",
          "share_max_views_exceeded",
        );
      }

      await this.increaseViewCount(share);
    }

    return {
      share: {
        ...share,
        hasPassword: !!share.security?.password,
      },
      shareToken: hasAdminAccess
        ? undefined
        : hasValidShareToken
          ? options?.shareToken
          : await this.generateShareToken(id),
      generatedShareToken: hasAdminAccess ? false : !hasValidShareToken,
    };
  }

  async getDetailedSharesByOwner(userId: string) {
    const shares = await this.prisma.share.findMany({
      where: {
        creatorId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        recipients: true,
        files: {
          orderBy: {
            name: "asc",
          },
        },
        security: true,
      },
    });

    return shares.map((share) => this.toDetailedOwnerShare(share));
  }

  async getDetailedShareByOwner(id: string, userId: string) {
    return this.toDetailedOwnerShare(
      await this.getOwnerShareEntity(id, userId),
    );
  }

  async assertShareOwnership(id: string, userId: string) {
    await this.getOwnerShareEntity(id, userId);
  }

  async getMetaData(id: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
    });

    if (!share || !share.uploadLocked)
      throw new NotFoundException("Share not found");

    return share;
  }

  async remove(
    shareId: string,
    options?: { isDeleterAdmin?: boolean; allowAnonymousOwner?: boolean },
  ) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    if (!share) throw new NotFoundException("Share not found");

    if (
      !share.creatorId &&
      !options?.isDeleterAdmin &&
      !options?.allowAnonymousOwner
    )
      throw new ForbiddenException("Anonymous shares can't be deleted");

    if (!options?.isDeleterAdmin && !options?.allowAnonymousOwner) {
      await this.expire(shareId);
      return;
    }

    await this.fileService.deleteAllFiles(shareId);
    await this.prisma.share.delete({ where: { id: shareId } });
  }

  async expire(shareId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    if (!share) throw new NotFoundException("Share not found");

    await this.prisma.share.update({
      where: { id: shareId },
      data: { expiration: moment().toDate() },
    });
  }

  async isShareCompleted(id: string) {
    return (await this.prisma.share.findUnique({ where: { id } })).uploadLocked;
  }

  async isShareIdAvailable(id: string) {
    const share = await this.prisma.share.findUnique({ where: { id } });
    return { isAvailable: !share };
  }

  async increaseViewCount(share: Share) {
    await this.prisma.share.update({
      where: { id: share.id },
      data: { views: share.views + 1 },
    });
  }

  async getShareToken(shareId: string, password: string) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      include: {
        security: true,
      },
    });

    if (share?.security?.password) {
      if (!password) {
        throw new ForbiddenException(
          "This share is password protected",
          "share_password_required",
        );
      }

      const isPasswordValid = await argon.verify(
        share.security.password,
        password,
      );
      if (!isPasswordValid) {
        throw new ForbiddenException("Wrong password", "wrong_password");
      }
    }

    if (share.security?.maxViews && share.security.maxViews <= share.views) {
      throw new ForbiddenException(
        "Maximum views exceeded",
        "share_max_views_exceeded",
      );
    }

    const token = await this.generateShareToken(shareId);
    await this.increaseViewCount(share);
    return token;
  }

  async generateShareToken(shareId: string) {
    const { expiration, createdAt } = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    const tokenPayload = {
      shareId,
      shareCreatedAt: moment(createdAt).unix(),
      iat: moment().unix(),
    };

    const tokenOptions: JwtSignOptions = {
      secret: this.config.get("internal.jwtSecret"),
    };

    if (!moment(expiration).isSame(0)) {
      tokenOptions.expiresIn = moment(expiration).diff(new Date(), "seconds");
    }

    return this.jwtService.sign(tokenPayload, tokenOptions);
  }

  async generateShareOwnerToken(shareId: string) {
    const { expiration, createdAt } = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    const tokenPayload = {
      shareId,
      shareCreatedAt: moment(createdAt).unix(),
      tokenType: "share-owner",
    };

    const tokenOptions: JwtSignOptions = {
      secret: this.config.get("internal.jwtSecret"),
    };

    if (!moment(expiration).isSame(0)) {
      tokenOptions.expiresIn = moment(expiration).diff(new Date(), "seconds");
    }

    return this.jwtService.sign(tokenPayload, tokenOptions);
  }

  async verifyShareToken(shareId: string, token: string) {
    const { expiration, createdAt } = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    try {
      const claims = this.jwtService.verify(token, {
        secret: this.config.get("internal.jwtSecret"),
        // Ignore expiration if expiration is 0
        ignoreExpiration: moment(expiration).isSame(0),
      });

      return (
        claims.shareId == shareId &&
        claims.shareCreatedAt == moment(createdAt).unix()
      );
    } catch {
      return false;
    }
  }

  async verifyShareOwnerToken(shareId: string, token: string) {
    const { expiration, createdAt } = await this.prisma.share.findUnique({
      where: { id: shareId },
    });

    try {
      const claims = this.jwtService.verify(token, {
        secret: this.config.get("internal.jwtSecret"),
        ignoreExpiration: moment(expiration).isSame(0),
      });

      return (
        claims.tokenType === "share-owner" &&
        claims.shareId == shareId &&
        claims.shareCreatedAt == moment(createdAt).unix()
      );
    } catch {
      return false;
    }
  }

  private async getOwnerShareEntity(id: string, userId?: string) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        recipients: true,
        files: {
          orderBy: {
            name: "asc",
          },
        },
        security: true,
      },
    });

    if (!share || (share.creatorId && share.creatorId !== userId)) {
      throw new NotFoundException("Share not found");
    }

    if (isShareRemoved(share)) {
      throw new NotFoundException(share.removedReason, "share_removed");
    }

    if (isShareExpired(share)) {
      throw new NotFoundException("Share not found");
    }

    return share;
  }

  private toDetailedOwnerShare(share: {
    createdAt: Date;
    description: string | null;
    expiration: Date;
    files: {
      createdAt: Date;
      id: string;
      name: string;
      shareId: string;
      size: string;
    }[];
    id: string;
    isZipReady: boolean;
    name: string | null;
    recipients: { email: string }[];
    security: { maxViews: number | null; password: string | null } | null;
    uploadLocked: boolean;
    views: number;
  }) {
    return {
      id: share.id,
      name: share.name,
      createdAt: share.createdAt,
      expiration: share.expiration,
      description: share.description,
      views: share.views,
      uploadLocked: share.uploadLocked,
      isZipReady: share.isZipReady,
      recipients: share.recipients.map((recipient) => recipient.email),
      files: share.files,
      size: share.files.reduce((acc, file) => acc + parseInt(file.size), 0),
      security: share.security
        ? {
            maxViews: share.security.maxViews,
            passwordProtected: !!share.security.password,
          }
        : undefined,
    };
  }

  private async getAnonymousOwnerAccess(shareId: string) {
    const ownerToken = await this.generateShareOwnerToken(shareId);

    return {
      ownerToken,
      ownerManagementLink: `${this.config.get(
        "general.appUrl",
      )}/share/${shareId}/edit#ownerToken=${encodeURIComponent(ownerToken)}`,
    };
  }
}
