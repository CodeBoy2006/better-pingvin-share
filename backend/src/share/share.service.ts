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
import { Request } from "express";
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
import { UpdateShareDTO } from "./dto/updateShare.dto";
import {
  isShareExpired,
  isShareRemoved,
  isShareWithinExpiredEditablePeriod,
} from "./shareAccess.util";
import { getRequestIpAddress, normalizeIpAddress } from "./shareIp.util";

type ShareSecurityWithIpRules = {
  id: string;
  password: string | null;
  maxViews: number | null;
  maxIps: number | null;
  allowedIps: { ipAddress: string }[];
  assignedIps: { ipAddress: string }[];
};

type NormalizedShareSecurity = {
  password?: string;
  maxViews?: number;
  maxIps?: number;
  allowedIps: string[];
};

type CurrentShareSecurity = ShareSecurityWithIpRules | null | undefined;

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

    const normalizedSecurity = this.normalizeShareSecurity(share.security);

    if (normalizedSecurity?.password) {
      normalizedSecurity.password = await argon.hash(
        normalizedSecurity.password,
      );
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
        security: normalizedSecurity
          ? {
              create: {
                password: normalizedSecurity.password,
                maxViews: normalizedSecurity.maxViews,
                maxIps: normalizedSecurity.maxIps,
                ...(normalizedSecurity.allowedIps.length > 0
                  ? {
                      allowedIps: {
                        create: normalizedSecurity.allowedIps.map(
                          (ipAddress) => ({
                            ipAddress,
                          }),
                        ),
                      },
                    }
                  : {}),
              },
            }
          : undefined,
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

  async update(
    id: string,
    update: UpdateShareDTO,
    options?: { userId?: string; isAdmin?: boolean },
  ) {
    const share = await this.getEditableShareEntity(id, options?.userId, {
      allowAdmin: options?.isAdmin,
    });
    const data: any = {};

    if ("name" in update) {
      data.name = update.name || null;
    }

    if ("description" in update) {
      data.description = update.description || null;
    }

    if (update.expiration !== undefined) {
      data.expiration = this.parseAndValidateExpiration(
        update.expiration,
        !!options?.isAdmin,
      );
    }

    if (update.recipients !== undefined) {
      data.recipients = {
        deleteMany: {},
        create: update.recipients.map((email) => ({ email })),
      };
    }

    if (update.security !== undefined) {
      const securityUpdate = await this.createSecurityUpdateInput(
        update.security,
        share.security,
      );
      data.security = securityUpdate;
    }

    await this.prisma.share.update({
      where: { id },
      data,
    });

    return this.toDetailedOwnerShare(
      await this.getEditableShareEntity(id, options?.userId, {
        allowAdmin: options?.isAdmin,
      }),
    );
  }

  async getShares() {
    const shares = await this.prisma.share.findMany({
      orderBy: {
        expiration: "desc",
      },
      include: {
        files: true,
        creator: true,
        recipients: true,
        security: {
          include: {
            allowedIps: true,
            assignedIps: true,
          },
        },
      },
    });

    return shares.map((share) => this.toDetailedOwnerShare(share));
  }

  async getAdminAuditShare(id: string) {
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

    if (!share) {
      throw new NotFoundException("Share not found");
    }

    if (isShareRemoved(share)) {
      throw new NotFoundException(share.removedReason, "share_removed");
    }

    return {
      ...share,
      hasPassword: !!share.security?.password,
      size: share.files.reduce((acc, file) => acc + parseInt(file.size), 0),
    };
  }

  async getAdminAuditFile(shareId: string, fileId: string) {
    const share = await this.prisma.share.findUnique({
      where: { id: shareId },
      select: { removedReason: true },
    });

    if (!share) {
      throw new NotFoundException("Share not found");
    }

    if (isShareRemoved(share)) {
      throw new NotFoundException(share.removedReason, "share_removed");
    }

    return this.fileService.get(shareId, fileId);
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
    const expiredEditablePeriod = this.configService.get(
      "share.expiredEditablePeriod",
    );
    const oldestEditableExpiration = moment()
      .subtract(expiredEditablePeriod.value, expiredEditablePeriod.unit)
      .toDate();
    const shares = await this.prisma.share.findMany({
      where: {
        creator: { id: userId },
        uploadLocked: true,
        OR: [
          { expiration: { gt: new Date() } },
          { expiration: { equals: moment(0).toDate() } },
          { expiration: { gte: oldestEditableExpiration } },
        ],
      },
      orderBy: {
        expiration: "desc",
      },
      include: {
        recipients: true,
        files: true,
        security: {
          include: {
            allowedIps: true,
            assignedIps: true,
          },
        },
      },
    });

    return shares.map((share) => this.toDetailedOwnerShare(share));
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
    const share = await this.getEditableShareEntity(id, userId);

    return {
      ...share,
      hasPassword: !!share.security?.password,
      size: share.files.reduce((acc, file) => acc + parseInt(file.size), 0),
    };
  }

  async getFileList(
    id: string,
    request: Request,
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
        security: {
          include: {
            allowedIps: true,
            assignedIps: true,
          },
        },
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
      await this.assertShareIpAccess(share, request);

      throw new ForbiddenException(
        options?.shareToken
          ? "Share token required"
          : "This share is password protected",
        options?.shareToken
          ? "share_token_required"
          : "share_password_required",
      );
    }

    if (!hasAdminAccess && hasValidShareToken) {
      await this.assertShareIpAccess(share, request, {
        assignIfNeeded: true,
      });
    }

    if (!hasAdminAccess && !hasValidShareToken) {
      if (share.security?.maxViews && share.security.maxViews <= share.views) {
        throw new ForbiddenException(
          "Maximum views exceeded",
          "share_max_views_exceeded",
        );
      }

      await this.assertShareIpAccess(share, request, {
        assignIfNeeded: true,
      });
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
    const expiredEditablePeriod = this.configService.get(
      "share.expiredEditablePeriod",
    );
    const oldestEditableExpiration = moment()
      .subtract(expiredEditablePeriod.value, expiredEditablePeriod.unit)
      .toDate();
    const shares = await this.prisma.share.findMany({
      where: {
        creatorId: userId,
        OR: [
          { expiration: { gt: new Date() } },
          { expiration: { equals: moment(0).toDate() } },
          { expiration: { gte: oldestEditableExpiration } },
        ],
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        creator: true,
        recipients: true,
        files: {
          orderBy: {
            name: "asc",
          },
        },
        security: {
          include: {
            allowedIps: true,
            assignedIps: true,
          },
        },
      },
    });

    return shares.map((share) => this.toDetailedOwnerShare(share));
  }

  async getDetailedShareByOwner(id: string, userId: string) {
    return this.toDetailedOwnerShare(
      await this.getEditableShareEntity(id, userId),
    );
  }

  async assertShareOwnership(id: string, userId: string) {
    await this.getEditableShareEntity(id, userId);
  }

  async assertShareFilesMutable(id: string, userId?: string) {
    const share = await this.getEditableShareEntity(id, userId);

    if (isShareExpired(share)) {
      throw new BadRequestException(
        "Expired shares must be extended before files can be changed",
      );
    }

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

  async getShareToken(shareId: string, password: string, request: Request) {
    const share = await this.prisma.share.findFirst({
      where: { id: shareId },
      include: {
        security: {
          include: {
            allowedIps: true,
            assignedIps: true,
          },
        },
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

    await this.assertShareIpAccess(share, request, {
      assignIfNeeded: true,
    });

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
    const expiredEditablePeriod = this.configService.get(
      "share.expiredEditablePeriod",
    );

    try {
      const claims = this.jwtService.verify(token, {
        secret: this.config.get("internal.jwtSecret"),
        ignoreExpiration:
          moment(expiration).isSame(0) ||
          isShareWithinExpiredEditablePeriod(
            { expiration },
            expiredEditablePeriod.value,
            expiredEditablePeriod.unit,
          ),
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

  private async getEditableShareEntity(
    id: string,
    userId?: string,
    options?: { allowAdmin?: boolean },
  ) {
    const share = await this.prisma.share.findUnique({
      where: { id },
      include: {
        recipients: true,
        files: {
          orderBy: {
            name: "asc",
          },
        },
        security: {
          include: {
            allowedIps: true,
            assignedIps: true,
          },
        },
      },
    });

    if (
      !share ||
      (!options?.allowAdmin && share.creatorId && share.creatorId !== userId)
    ) {
      throw new NotFoundException("Share not found");
    }

    if (isShareRemoved(share)) {
      throw new NotFoundException(share.removedReason, "share_removed");
    }

    const expiredEditablePeriod = this.configService.get(
      "share.expiredEditablePeriod",
    );

    if (
      !isShareWithinExpiredEditablePeriod(
        share,
        expiredEditablePeriod.value,
        expiredEditablePeriod.unit,
      )
    ) {
      throw new NotFoundException("Share not found");
    }

    return share;
  }

  private parseAndValidateExpiration(expiration: string, skipMax: boolean) {
    const parsedExpiration = parseRelativeDateToAbsolute(expiration);
    const expiresNever = moment(parsedExpiration).isSame(moment(0));

    if (!skipMax) {
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
    }

    return parsedExpiration;
  }

  private async createSecurityUpdateInput(
    security: UpdateShareDTO["security"],
    currentSecurity?: CurrentShareSecurity,
  ) {
    if (!security) {
      return undefined;
    }

    const hasPasswordUpdate = this.hasProperty(security, "password");
    const hasMaxViewsUpdate = this.hasProperty(security, "maxViews");
    const hasMaxIpsUpdate = this.hasProperty(security, "maxIps");
    const hasAllowedIpsUpdate = this.hasProperty(security, "allowedIps");

    const password = hasPasswordUpdate
      ? await this.getSecurityPasswordUpdate(security.password)
      : currentSecurity?.password ?? null;
    const maxViews = hasMaxViewsUpdate
      ? this.normalizeNullableNumber(security.maxViews)
      : currentSecurity?.maxViews ?? null;
    const allowedIps = hasAllowedIpsUpdate
      ? this.normalizeAllowedIps(security.allowedIps ?? [])
      : hasMaxIpsUpdate && this.normalizeNullableNumber(security.maxIps)
        ? []
        : currentSecurity?.allowedIps.map((ip) => ip.ipAddress) ?? [];
    const maxIps = hasMaxIpsUpdate
      ? this.normalizeNullableNumber(security.maxIps)
      : hasAllowedIpsUpdate
        ? allowedIps.length > 0
          ? null
          : (currentSecurity?.maxIps ?? null)
        : currentSecurity?.maxIps ?? null;

    if (maxIps && allowedIps.length > 0) {
      throw new BadRequestException(
        "Cannot combine a maximum IP limit with specific IP addresses",
      );
    }

    const hasSecurity =
      !!password ||
      maxViews !== null ||
      maxIps !== null ||
      allowedIps.length > 0;

    if (!hasSecurity) {
      return currentSecurity ? { delete: true } : undefined;
    }

    const createData = {
      password,
      maxViews,
      maxIps,
      ...(allowedIps.length > 0
        ? {
            allowedIps: {
              create: allowedIps.map((ipAddress) => ({
                ipAddress,
              })),
            },
          }
        : {}),
    };

    const updateData: any = {};

    if (hasPasswordUpdate) {
      updateData.password = password;
    }

    if (hasMaxViewsUpdate) {
      updateData.maxViews = maxViews;
    }

    if (hasMaxIpsUpdate || hasAllowedIpsUpdate) {
      updateData.maxIps = maxIps;
      updateData.allowedIps = {
        deleteMany: {},
        create: allowedIps.map((ipAddress) => ({
          ipAddress,
        })),
      };
      updateData.assignedIps = {
        deleteMany: {},
      };
    }

    if (Object.keys(updateData).length === 0 && currentSecurity) {
      return undefined;
    }

    return {
      upsert: {
        create: createData,
        update: updateData,
      },
    };
  }

  private async getSecurityPasswordUpdate(password?: string | null) {
    if (password === undefined || password === null) {
      return null;
    }

    if (password === "") {
      return null;
    }

    return await argon.hash(password);
  }

  private toDetailedOwnerShare(share: {
    createdAt: Date;
    creator?: { username: string } | null;
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
    security: {
      id?: string;
      maxViews: number | null;
      password: string | null;
      maxIps: number | null;
      allowedIps: { ipAddress: string }[];
      assignedIps: { ipAddress: string }[];
    } | null;
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
      creator: share.creator ?? undefined,
      recipients: share.recipients.map((recipient) => recipient.email),
      files: share.files,
      size: share.files.reduce((acc, file) => acc + parseInt(file.size), 0),
      security: {
        maxViews: share.security?.maxViews,
        passwordProtected: !!share.security?.password,
        maxIps: share.security?.maxIps,
        allowedIps: share.security?.allowedIps.map((ip) => ip.ipAddress) ?? [],
        assignedIps:
          share.security?.assignedIps.map((ip) => ip.ipAddress) ?? [],
      },
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

  async assertShareIpAccess(
    share: {
      security?: ShareSecurityWithIpRules | null;
    },
    request: Request,
    options?: { assignIfNeeded?: boolean },
  ) {
    const security = share.security;

    if (!security) {
      return;
    }

    const allowedIps = security.allowedIps.map((ip) => ip.ipAddress);
    const hasAllowedIpList = allowedIps.length > 0;
    const hasDynamicIpLimit = !!security.maxIps;

    if (!hasAllowedIpList && !hasDynamicIpLimit) {
      return;
    }

    const requestIp = getRequestIpAddress(request);
    if (!requestIp) {
      throw new ForbiddenException(
        "Could not determine the request IP address",
        "share_ip_not_allowed",
      );
    }

    if (hasAllowedIpList) {
      if (allowedIps.includes(requestIp)) {
        return;
      }

      throw new ForbiddenException(
        "Your IP address is not allowed to access this share",
        "share_ip_not_allowed",
      );
    }

    const assignedIps = security.assignedIps.map((ip) => ip.ipAddress);
    if (assignedIps.includes(requestIp)) {
      return;
    }

    if (!options?.assignIfNeeded) {
      return;
    }

    const wasAssigned = await this.assignShareIpAddress(
      security.id,
      requestIp,
      security.maxIps,
    );

    if (wasAssigned) {
      return;
    }

    throw new ForbiddenException(
      "This share has already been claimed by the maximum number of IP addresses",
      "share_ip_limit_exceeded",
    );
  }

  private normalizeShareSecurity(
    security?: CreateShareDTO["security"],
    options?: { preserveEmptyPassword?: boolean },
  ): NormalizedShareSecurity | undefined {
    if (!security) {
      return undefined;
    }

    const password =
      options?.preserveEmptyPassword && security.password === ""
        ? ""
        : security.password || undefined;
    const maxViews =
      typeof security.maxViews === "number" ? security.maxViews : undefined;
    const maxIps =
      typeof security.maxIps === "number" ? security.maxIps : undefined;
    const rawAllowedIps = (security.allowedIps ?? [])
      .map((ip) => ip?.trim())
      .filter((ip): ip is string => !!ip);
    const normalizedAllowedIps = [
      ...new Set(
        rawAllowedIps.map((ip) => {
          const normalizedIp = normalizeIpAddress(ip);

          if (!normalizedIp) {
            throw new BadRequestException(`Invalid IP address: ${ip}`);
          }

          return normalizedIp;
        }),
      ),
    ];

    if (maxIps && normalizedAllowedIps.length > 0) {
      throw new BadRequestException(
        "Cannot combine a maximum IP limit with specific IP addresses",
      );
    }

    if (
      !password &&
      maxViews === undefined &&
      maxIps === undefined &&
      normalizedAllowedIps.length === 0
    ) {
      return undefined;
    }

    return {
      password,
      maxViews,
      maxIps,
      allowedIps: normalizedAllowedIps,
    };
  }

  private normalizeNullableNumber(value?: number | null) {
    return typeof value === "number" ? value : null;
  }

  private normalizeAllowedIps(allowedIps: string[]) {
    return [
      ...new Set(
        allowedIps
          .map((ip) => ip?.trim())
          .filter((ip): ip is string => !!ip)
          .map((ip) => {
            const normalizedIp = normalizeIpAddress(ip);

            if (!normalizedIp) {
              throw new BadRequestException(`Invalid IP address: ${ip}`);
            }

            return normalizedIp;
          }),
      ),
    ];
  }

  private hasProperty<T extends object>(value: T, property: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, property);
  }

  private async assignShareIpAddress(
    shareSecurityId: string,
    ipAddress: string,
    maxIps?: number | null,
  ) {
    if (!maxIps) {
      return true;
    }

    return this.prisma.$transaction(async (transaction) => {
      const existingAssignment =
        await transaction.shareSecurityAssignedIp.findUnique({
          where: {
            shareSecurityId_ipAddress: {
              shareSecurityId,
              ipAddress,
            },
          },
        });

      if (existingAssignment) {
        return true;
      }

      const assignedIpCount = await transaction.shareSecurityAssignedIp.count({
        where: { shareSecurityId },
      });

      if (assignedIpCount >= maxIps) {
        return false;
      }

      try {
        await transaction.shareSecurityAssignedIp.create({
          data: {
            shareSecurityId,
            ipAddress,
          },
        });

        return true;
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "P2002"
        ) {
          return true;
        }

        throw error;
      }
    });
  }
}
