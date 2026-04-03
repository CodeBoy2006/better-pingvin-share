import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "src/config/config.service";
import {
  buildConfigEntries,
  buildConfigUpdate,
  findConfigEntry,
} from "../../fixtures/config.fixture";

describe("ConfigService", () => {
  let prisma: {
    config: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    user: {
      count: jest.Mock;
      create: jest.Mock;
    };
  };
  let service: ConfigService;

  beforeEach(() => {
    prisma = {
      config: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        count: jest.fn(),
        create: jest.fn(),
      },
    };
    service = new ConfigService(buildConfigEntries(), prisma as never);
  });

  it("parses config values according to their defined types", () => {
    const configs = buildConfigEntries({
      "general.secureCookies": "true",
      "general.sessionDuration": "6 months",
      "share.shareIdLength": "12",
    });

    service = new ConfigService(configs, prisma as never);

    expect(service.get("general.secureCookies")).toBe(true);
    expect(service.get("share.shareIdLength")).toBe(12);
    expect(service.get("general.sessionDuration")).toEqual({
      unit: "months",
      value: 6,
    });
  });

  it("marks editable admin configs by category when yaml config is absent", async () => {
    const configs = await service.getByCategory("share");

    expect(configs.length).toBeGreaterThan(0);
    expect(configs.every((entry) => entry.allowEdit)).toBe(true);
    expect(configs.some((entry) => entry.locked)).toBe(false);
  });

  it("rejects config writes when yaml config is driving the application", async () => {
    service.yamlConfig = {} as never;

    await expect(
      service.updateMany([buildConfigUpdate("share.shareIdLength", 10)]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects missing or locked config variables", async () => {
    prisma.config.findUnique.mockResolvedValue(null);

    await expect(service.update("share.unknown", 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("validates config values before persisting them", async () => {
    prisma.config.findUnique.mockResolvedValue(
      findConfigEntry(buildConfigEntries(), "share.shareIdLength"),
    );

    await expect(
      service.update("share.shareIdLength", 1),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("persists config updates, refreshes the cached config list, and emits change events", async () => {
    const configs = buildConfigEntries();
    const updatedEntry = {
      ...findConfigEntry(configs, "share.shareIdLength"),
      value: "10",
    };
    prisma.config.findUnique.mockResolvedValue(
      findConfigEntry(configs, "share.shareIdLength"),
    );
    prisma.config.update.mockResolvedValue(updatedEntry);
    prisma.config.findMany.mockResolvedValue([
      ...configs.filter(
        (entry) => `${entry.category}.${entry.name}` !== "share.shareIdLength",
      ),
      updatedEntry,
    ]);
    const emitSpy = jest.spyOn(service, "emit");

    const result = await service.update("share.shareIdLength", 10);

    expect(prisma.config.update).toHaveBeenCalledWith({
      data: {
        value: "10",
      },
      where: {
        name_category: {
          category: "share",
          name: "shareIdLength",
        },
      },
    });
    expect(service.configVariables).toHaveLength(configs.length);
    expect(emitSpy).toHaveBeenCalledWith("update", "share.shareIdLength", 10);
    expect(result).toEqual(updatedEntry);
  });
});
