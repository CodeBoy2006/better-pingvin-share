import { describe, expect, it, vi } from "vitest";
import type { CurrentUser } from "../../../src/types/user.type";
import useUser from "../../../src/hooks/user.hook";
import { renderHookWithProviders } from "../../render";

describe("user.hook", () => {
  it("returns the current user context and refresh function", async () => {
    const user = {
      id: "user-1",
      username: "pingvin",
      email: "pingvin@example.com",
      isAdmin: true,
      isLdap: false,
      totpVerified: true,
      hasPassword: true,
    } satisfies CurrentUser;
    const refreshUser = vi.fn().mockResolvedValue(user);

    const { result } = renderHookWithProviders(() => useUser(), {
      providers: {
        user,
        userRefresh: refreshUser,
      },
    });

    expect(result.current.user).toEqual(user);
    expect(await result.current.refreshUser()).toEqual(user);
    expect(refreshUser).toHaveBeenCalledTimes(1);
  });
});
