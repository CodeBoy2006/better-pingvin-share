import { beforeEach, describe, expect, it, vi } from "vitest";
import type Config from "../../../src/types/config.type";
import { createAxiosResponse } from "../../network";

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));
const axiosGetMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/services/api.service", () => ({
  default: apiMock,
}));
vi.mock("axios", () => ({
  default: {
    get: axiosGetMock,
  },
  get: axiosGetMock,
}));

import configService from "../../../src/services/config.service";

describe("config.service", () => {
  beforeEach(() => {
    apiMock.get.mockReset();
    apiMock.patch.mockReset();
    apiMock.post.mockReset();
    axiosGetMock.mockReset();
  });

  it("lists, groups, and updates admin config variables", async () => {
    const configEntries = [
      {
        key: "general.appName",
        value: "Pingvin",
        defaultValue: "Pingvin Share",
        type: "string",
      },
    ];
    const adminEntries = [
      {
        ...configEntries[0],
        allowEdit: true,
        description: "Application name",
        name: "App name",
        obscured: false,
        secret: false,
        updatedAt: new Date("2026-04-03T00:00:00.000Z"),
      },
    ];

    apiMock.get
      .mockResolvedValueOnce(createAxiosResponse(configEntries))
      .mockResolvedValueOnce(createAxiosResponse(adminEntries));
    apiMock.patch.mockResolvedValue(createAxiosResponse(adminEntries));

    await expect(configService.list()).resolves.toEqual(configEntries);
    await expect(configService.getByCategory("general")).resolves.toEqual(
      adminEntries,
    );
    await expect(
      configService.updateMany([
        {
          key: "general.appName",
          value: "Better Pingvin Share",
        },
      ]),
    ).resolves.toEqual(adminEntries);

    expect(apiMock.get).toHaveBeenNthCalledWith(1, "/configs");
    expect(apiMock.get).toHaveBeenNthCalledWith(2, "/configs/admin/general");
    expect(apiMock.patch).toHaveBeenCalledWith("/configs/admin", [
      {
        key: "general.appName",
        value: "Better Pingvin Share",
      },
    ]);
  });

  it("parses typed config values", () => {
    const configEntries = [
      {
        key: "share.maxSize",
        value: "2048",
        defaultValue: "1024",
        type: "filesize",
      },
      {
        key: "share.allowRegistration",
        value: "true",
        defaultValue: "false",
        type: "boolean",
      },
      {
        key: "general.appName",
        value: "Better Pingvin Share",
        defaultValue: "Pingvin Share",
        type: "string",
      },
      {
        key: "share.defaultExpiration",
        value: "7 days",
        defaultValue: "1 days",
        type: "timespan",
      },
      {
        key: "legal.imprintText",
        value: "",
        defaultValue: "Default imprint",
        type: "text",
      },
    ] satisfies Config[];

    expect(configService.get("share.maxSize", configEntries)).toBe(2048);
    expect(configService.get("share.allowRegistration", configEntries)).toBe(
      true,
    );
    expect(configService.get("general.appName", configEntries)).toBe(
      "Better Pingvin Share",
    );
    expect(configService.get("share.defaultExpiration", configEntries)).toEqual(
      {
        unit: "days",
        value: 7,
      },
    );
    expect(configService.get("legal.imprintText", configEntries)).toBe("");
    expect(configService.get("anything", null as unknown as Config[])).toBeNull();
    expect(configService.get("share.maxExpiration", [])).toEqual({
      unit: "days",
      value: 0,
    });
    expect(() => configService.get("missing", configEntries)).toThrow(
      "Config variable missing not found",
    );
  });

  it("supports setup completion and test-email requests", async () => {
    apiMock.post
      .mockResolvedValueOnce(createAxiosResponse([{ key: "setup", value: "done" }]))
      .mockResolvedValueOnce(createAxiosResponse({}));

    await expect(configService.finishSetup()).resolves.toEqual([
      { key: "setup", value: "done" },
    ]);
    await configService.sendTestEmail("user@example.com");

    expect(apiMock.post).toHaveBeenNthCalledWith(
      1,
      "/configs/admin/finishSetup",
    );
    expect(apiMock.post).toHaveBeenNthCalledWith(
      2,
      "/configs/admin/testEmail",
      { email: "user@example.com" },
    );
  });

  it("checks whether a newer release is available", async () => {
    vi.stubEnv("VERSION", "1.15.0");
    axiosGetMock.mockResolvedValueOnce(
      createAxiosResponse({
        tag_name: "v1.16.0",
      }),
    );

    await expect(configService.isNewReleaseAvailable()).resolves.toBe(true);
    expect(axiosGetMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/CodeBoy2006/better-pingvin-share/releases/latest",
    );
  });

  it("uploads a replacement logo as form data", async () => {
    const file = new File(["logo"], "logo.png", { type: "image/png" });

    await configService.changeLogo(file);

    expect(apiMock.post).toHaveBeenCalledWith(
      "/configs/admin/logo",
      expect.any(FormData),
    );

    const formData = apiMock.post.mock.calls[0][1] as FormData;
    expect(formData.get("file")).toBe(file);
  });
});
