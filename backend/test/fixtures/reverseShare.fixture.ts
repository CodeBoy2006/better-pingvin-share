import type { ReverseShare, Share } from "@prisma/client";
import type { CreateReverseShareDTO } from "src/reverseShare/dto/createReverseShare.dto";

const fixedDate = new Date("2024-01-01T00:00:00.000Z");

let reverseShareSequence = 0;

const nextReverseShareSequence = () => {
  reverseShareSequence += 1;
  return reverseShareSequence;
};

export const buildCreateReverseShareDto = (
  overrides: Partial<CreateReverseShareDTO> = {},
): CreateReverseShareDTO => ({
  sendEmailNotification: false,
  maxShareSize: "512000",
  shareExpiration: "7-day",
  maxUseCount: 5,
  simplified: false,
  publicAccess: true,
  ...overrides,
});

export const buildReverseShareEntity = (
  overrides: Partial<ReverseShare> = {},
): ReverseShare => {
  const sequence = nextReverseShareSequence();

  return {
    id: `reverse-share-${sequence}`,
    createdAt: fixedDate,
    token: `reverse-token-${sequence}`,
    shareExpiration: new Date("2024-01-08T00:00:00.000Z"),
    maxShareSize: "512000",
    sendEmailNotification: false,
    remainingUses: 5,
    simplified: false,
    publicAccess: true,
    creatorId: `user-${sequence}`,
    ...overrides,
  };
};

export const buildShareEntity = (overrides: Partial<Share> = {}): Share => {
  const sequence = nextReverseShareSequence();

  return {
    id: `share-${sequence}`,
    createdAt: fixedDate,
    name: null,
    uploadLocked: false,
    isZipReady: false,
    views: 0,
    expiration: new Date("2024-01-08T00:00:00.000Z"),
    description: null,
    removedReason: null,
    creatorId: `user-${sequence}`,
    reverseShareId: null,
    storageProvider: "LOCAL",
    ...overrides,
  };
};
