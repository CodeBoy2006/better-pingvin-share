import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiToken } from "@prisma/client";
import * as crypto from "crypto";
import { ConfigService } from "src/config/config.service";
import { PrismaService } from "src/prisma/prisma.service";
import { API_TOKEN_PREFIX } from "./apiToken.constants";
import { ApiPrincipalType } from "./apiToken.types";
import {
  deserializeApiTokenScopes,
  hashApiTokenSecret,
  normalizeApiTokenScopes,
  parseApiToken,
  serializeApiTokenScopes,
} from "./apiToken.util";

@Injectable()
export class ApiTokenService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  async createForUser(data: {
    userId: string;
    name: string;
    scopes: string[];
    expiresAt?: string;
  }) {
    const scopes = normalizeApiTokenScopes(data.scopes);

    if (scopes.length === 0) {
      throw new BadRequestException("At least one valid scope is required");
    }

    const expiresAt = data.expiresAt ? new Date(data.expiresAt) : undefined;

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException("Invalid expiration date");
    }

    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException("Expiration date must be in the future");
    }

    const secret = crypto.randomBytes(32).toString("base64url");
    const token = await this.prisma.apiToken.create({
      data: {
        name: data.name,
        scopes: serializeApiTokenScopes(scopes),
        expiresAt,
        secretHash: this.hashSecret(secret),
        userId: data.userId,
      },
    });

    return {
      ...this.toDTO(token),
      token: `${API_TOKEN_PREFIX}_${token.id}.${secret}`,
    };
  }

  async listByUser(userId: string) {
    const tokens = await this.prisma.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    return tokens.map((token) => this.toDTO(token));
  }

  async revokeForUser(tokenId: string, userId: string) {
    const token = await this.prisma.apiToken.findUnique({
      where: { id: tokenId },
    });

    if (!token || token.userId !== userId) {
      throw new NotFoundException("API token not found");
    }

    if (token.revokedAt) return;

    await this.prisma.apiToken.update({
      where: { id: tokenId },
      data: { revokedAt: new Date() },
    });
  }

  async validateAuthorizationHeader(
    authorizationHeader?: string,
  ): Promise<ApiPrincipalType> {
    const parsedToken = parseApiToken(authorizationHeader);

    if (!parsedToken) {
      throw new UnauthorizedException("API token required");
    }

    const token = await this.prisma.apiToken.findUnique({
      where: { id: parsedToken.tokenId },
      include: { user: true },
    });

    if (!token || token.revokedAt || !token.user) {
      throw new UnauthorizedException("Invalid API token");
    }

    if (token.expiresAt && token.expiresAt <= new Date()) {
      throw new UnauthorizedException("API token expired");
    }

    const secretHash = this.hashSecret(parsedToken.secret);
    if (
      secretHash.length !== token.secretHash.length ||
      !crypto.timingSafeEqual(
        Buffer.from(secretHash, "utf8"),
        Buffer.from(token.secretHash, "utf8"),
      )
    ) {
      throw new UnauthorizedException("Invalid API token");
    }

    return {
      tokenId: token.id,
      scopes: deserializeApiTokenScopes(token.scopes),
      user: token.user,
    };
  }

  toDTO(token: ApiToken) {
    return {
      id: token.id,
      name: token.name,
      scopes: deserializeApiTokenScopes(token.scopes),
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      lastUsedAt: token.lastUsedAt,
      lastUsedIp: token.lastUsedIp,
      revokedAt: token.revokedAt,
    };
  }

  private hashSecret(secret: string) {
    return hashApiTokenSecret(
      secret,
      this.config.get("internal.apiTokenSecret"),
    );
  }
}
