import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAxiosResponse } from "../../network";

const apiMock = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
}));
const refreshAccessTokenMock = vi.hoisted(() => vi.fn());

vi.mock("../../../src/services/api.service", () => ({
  default: apiMock,
}));
vi.mock("../../../src/services/auth.service", () => ({
  default: {
    refreshAccessToken: refreshAccessTokenMock,
  },
}));

import userService from "../../../src/services/user.service";

describe("user.service", () => {
  beforeEach(() => {
    apiMock.delete.mockReset();
    apiMock.get.mockReset();
    apiMock.patch.mockReset();
    apiMock.post.mockReset();
    refreshAccessTokenMock.mockReset();
  });

  it("lists, creates, updates, and deletes users", async () => {
    apiMock.get.mockResolvedValue(createAxiosResponse([{ id: "user-1" }]));
    apiMock.post.mockResolvedValue(createAxiosResponse({ id: "user-2" }));
    apiMock.patch
      .mockResolvedValueOnce(createAxiosResponse({ id: "user-1", username: "updated" }))
      .mockResolvedValueOnce(createAxiosResponse({ id: "me", username: "current" }));

    await expect(userService.list()).resolves.toEqual([{ id: "user-1" }]);
    await expect(
      userService.create({
        email: "user@example.com",
        username: "pingvin",
      }),
    ).resolves.toEqual({ id: "user-2" });
    await expect(
      userService.update("user-1", { username: "updated" }),
    ).resolves.toEqual({ id: "user-1", username: "updated" });
    await expect(
      userService.updateCurrentUser({ username: "current" }),
    ).resolves.toEqual({ id: "me", username: "current" });

    await userService.remove("user-1");
    await userService.removeCurrentUser();

    expect(apiMock.get).toHaveBeenCalledWith("/users");
    expect(apiMock.post).toHaveBeenCalledWith("/users", {
      email: "user@example.com",
      username: "pingvin",
    });
    expect(apiMock.patch).toHaveBeenNthCalledWith(1, "/users/user-1", {
      username: "updated",
    });
    expect(apiMock.patch).toHaveBeenNthCalledWith(2, "/users/me", {
      username: "current",
    });
    expect(apiMock.delete).toHaveBeenNthCalledWith(1, "/users/user-1");
    expect(apiMock.delete).toHaveBeenNthCalledWith(2, "/users/me");
  });

  it("refreshes the current user before loading /users/me", async () => {
    const currentUser = {
      email: "user@example.com",
      hasPassword: true,
      id: "user-1",
      isAdmin: false,
      isLdap: false,
      totpVerified: true,
      username: "pingvin",
    };
    apiMock.get.mockResolvedValue(createAxiosResponse(currentUser));

    await expect(userService.getCurrentUser()).resolves.toEqual(currentUser);

    expect(refreshAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(apiMock.get).toHaveBeenCalledWith("users/me");
  });

  it("returns null when refreshing or loading the current user fails", async () => {
    refreshAccessTokenMock.mockRejectedValue(new Error("expired"));

    await expect(userService.getCurrentUser()).resolves.toBeNull();
  });
});
