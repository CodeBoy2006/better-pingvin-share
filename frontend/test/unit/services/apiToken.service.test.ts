import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAxiosResponse } from "../../network";

const apiMock = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../../src/services/api.service", () => ({
  default: apiMock,
}));

import apiTokenService from "../../../src/services/apiToken.service";

describe("apiToken.service", () => {
  beforeEach(() => {
    apiMock.delete.mockReset();
    apiMock.get.mockReset();
    apiMock.post.mockReset();
  });

  it("lists API tokens", async () => {
    const tokens = [{ id: "token-1", name: "CI", scopes: ["shares:read"] }];
    apiMock.get.mockResolvedValue(createAxiosResponse(tokens));

    await expect(apiTokenService.list()).resolves.toEqual(tokens);
    expect(apiMock.get).toHaveBeenCalledWith("/v1/tokens");
  });

  it("creates API tokens", async () => {
    const createdToken = {
      id: "token-1",
      name: "CI",
      scopes: ["shares:read"],
      token: "plain-secret",
    };
    apiMock.post.mockResolvedValue(createAxiosResponse(createdToken));

    await expect(
      apiTokenService.create({
        name: "CI",
        scopes: ["shares:read"],
      }),
    ).resolves.toEqual(createdToken);
    expect(apiMock.post).toHaveBeenCalledWith("/v1/tokens", {
      name: "CI",
      scopes: ["shares:read"],
    });
  });

  it("deletes API tokens", async () => {
    await apiTokenService.remove("token-1");

    expect(apiMock.delete).toHaveBeenCalledWith("/v1/tokens/token-1");
  });
});
