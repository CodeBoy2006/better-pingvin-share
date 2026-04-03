import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { API_TOKEN_USAGE_WINDOW_MS } from "src/apiToken/apiToken.constants";
import { ApiTokenUsageService } from "src/apiToken/apiTokenUsage.service";

describe("ApiTokenUsageService", () => {
  let prisma: any;
  let service: ApiTokenUsageService;

  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date("2024-05-01T00:00:00.000Z").getTime(),
    });

    prisma = {
      apiToken: {
        update: jest.fn().mockImplementation(async () => undefined),
      },
    };

    service = new ApiTokenUsageService(prisma as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("persists usage once per throttling window with the latest metadata", async () => {
    service.recordUsage("token-usage-1", "10.0.0.1");
    await Promise.resolve();

    service.recordUsage("token-usage-1", "10.0.0.2");
    await Promise.resolve();

    expect(prisma.apiToken.update).toHaveBeenCalledTimes(1);
    expect(prisma.apiToken.update).toHaveBeenLastCalledWith({
      where: { id: "token-usage-1" },
      data: {
        lastUsedAt: new Date("2024-05-01T00:00:00.000Z"),
        lastUsedIp: "10.0.0.1",
      },
    });

    jest.advanceTimersByTime(API_TOKEN_USAGE_WINDOW_MS + 1);

    service.recordUsage("token-usage-1", "10.0.0.2");
    await Promise.resolve();

    expect(prisma.apiToken.update).toHaveBeenCalledTimes(2);
    expect(prisma.apiToken.update).toHaveBeenLastCalledWith({
      where: { id: "token-usage-1" },
      data: {
        lastUsedAt: new Date(Date.now()),
        lastUsedIp: "10.0.0.2",
      },
    });
  });

  it("logs and swallows persistence failures", async () => {
    prisma.apiToken.update.mockRejectedValueOnce(new Error("database offline"));
    const warn = jest.fn();
    (service as any).logger.warn = warn;

    service.recordUsage("token-usage-2", "10.0.0.3");
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("token-usage-2"),
    );
  });
});
