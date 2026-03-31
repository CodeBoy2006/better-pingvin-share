import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { API_TOKEN_USAGE_WINDOW_MS } from "./apiToken.constants";

type TokenUsageState = {
  lastPersistedAt: number;
  lastSeenAt: Date;
  lastSeenIp?: string;
};

@Injectable()
export class ApiTokenUsageService {
  private readonly logger = new Logger(ApiTokenUsageService.name);
  private readonly tokenUsage = new Map<string, TokenUsageState>();

  constructor(private prisma: PrismaService) {}

  recordUsage(tokenId: string, ip?: string) {
    const now = new Date();
    const state = this.tokenUsage.get(tokenId) ?? {
      lastPersistedAt: 0,
      lastSeenAt: now,
      lastSeenIp: ip,
    };

    state.lastSeenAt = now;
    state.lastSeenIp = ip ?? state.lastSeenIp;

    this.tokenUsage.set(tokenId, state);

    if (now.getTime() - state.lastPersistedAt < API_TOKEN_USAGE_WINDOW_MS) {
      return;
    }

    state.lastPersistedAt = now.getTime();

    void this.prisma.apiToken
      .update({
        where: { id: tokenId },
        data: {
          lastUsedAt: state.lastSeenAt,
          lastUsedIp: state.lastSeenIp,
        },
      })
      .catch((error) => {
        this.logger.warn(
          `Failed to persist usage metadata for API token ${tokenId}: ${error}`,
        );
      });
  }
}
