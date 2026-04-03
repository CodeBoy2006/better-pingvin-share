import { randomUUID } from "node:crypto";
import * as argon from "argon2";
import type { IntegrationAppFixture } from "./test-app.fixture";

type SeedShareInput = Partial<{
  id: string;
  name: string | null;
  description: string | null;
  expiration: Date;
  creatorId: string | null;
  reverseShareId: string | null;
  uploadLocked: boolean;
  isZipReady: boolean;
  views: number;
  removedReason: string | null;
  storageProvider: "LOCAL" | "S3";
  recipients: string[];
  security: {
    password?: string | null;
    maxViews?: number | null;
  };
}>;

type SeedReverseShareInput = Partial<{
  creatorId: string;
  token: string;
  shareExpiration: Date;
  maxShareSize: string;
  sendEmailNotification: boolean;
  remainingUses: number;
  simplified: boolean;
  publicAccess: boolean;
}>;

export function buildCreateShareDto(
  overrides: Partial<{
    id: string;
    name?: string;
    expiration: string;
    description?: string;
    recipients: string[];
    security: {
      password?: string;
      maxViews?: number;
    };
  }> = {},
) {
  return {
    id: `share-${randomUUID().slice(0, 8)}`,
    expiration: "1-day",
    recipients: [],
    security: {},
    ...overrides,
  };
}

export async function seedReverseShare(
  fixture: IntegrationAppFixture,
  overrides: SeedReverseShareInput = {},
) {
  return fixture.prisma.reverseShare.create({
    data: {
      token: overrides.token ?? randomUUID(),
      shareExpiration:
        overrides.shareExpiration ??
        new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      maxShareSize: overrides.maxShareSize ?? "1000000",
      sendEmailNotification: overrides.sendEmailNotification ?? false,
      remainingUses: overrides.remainingUses ?? 5,
      simplified: overrides.simplified ?? false,
      publicAccess: overrides.publicAccess ?? true,
      creatorId: overrides.creatorId,
    },
  });
}

export async function seedShare(
  fixture: IntegrationAppFixture,
  overrides: SeedShareInput = {},
) {
  const shareId = overrides.id ?? `share-${randomUUID().slice(0, 8)}`;
  fixture.createShareDirectory(shareId);

  const password = overrides.security?.password
    ? await argon.hash(overrides.security.password)
    : undefined;

  return fixture.prisma.share.create({
    data: {
      id: shareId,
      name: overrides.name ?? "Batch C share",
      description: overrides.description ?? "Fixture share",
      expiration:
        overrides.expiration ?? new Date(Date.now() + 1000 * 60 * 60 * 24),
      creatorId: overrides.creatorId,
      reverseShareId: overrides.reverseShareId,
      uploadLocked: overrides.uploadLocked ?? false,
      isZipReady: overrides.isZipReady ?? false,
      views: overrides.views ?? 0,
      removedReason: overrides.removedReason,
      storageProvider: overrides.storageProvider ?? "LOCAL",
      ...(overrides.recipients
        ? {
            recipients: {
              create: overrides.recipients.map((email) => ({ email })),
            },
          }
        : {}),
      ...(overrides.security
        ? {
            security: {
              create: {
                maxViews: overrides.security.maxViews,
                password,
              },
            },
          }
        : {}),
    },
    include: {
      recipients: true,
      files: true,
      security: true,
      reverseShare: true,
      creator: true,
    },
  });
}
