import type { ExecutionContext } from "@nestjs/common";
import { JwtGuard } from "src/auth/guard/jwt.guard";

describe("JwtGuard", () => {
  const context = {} as ExecutionContext;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the nested passport result when authentication succeeds", async () => {
    const config = {
      get: jest.fn(),
    };
    const guard = new JwtGuard(config as never);
    const baseCanActivate = jest
      .spyOn(Object.getPrototypeOf(JwtGuard.prototype), "canActivate")
      .mockResolvedValue(true as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(baseCanActivate).toHaveBeenCalledWith(context);
    expect(config.get).not.toHaveBeenCalled();
  });

  it("allows the request when auth fails but unauthenticated shares are enabled", async () => {
    const config = {
      get: jest.fn().mockReturnValue(true),
    };
    const guard = new JwtGuard(config as never);

    jest
      .spyOn(Object.getPrototypeOf(JwtGuard.prototype), "canActivate")
      .mockRejectedValue(new Error("auth failed"));

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(config.get).toHaveBeenCalledWith("share.allowUnauthenticatedShares");
  });

  it("blocks the request when auth fails and unauthenticated shares are disabled", async () => {
    const config = {
      get: jest.fn().mockReturnValue(false),
    };
    const guard = new JwtGuard(config as never);

    jest
      .spyOn(Object.getPrototypeOf(JwtGuard.prototype), "canActivate")
      .mockRejectedValue(new Error("auth failed"));

    await expect(guard.canActivate(context)).resolves.toBe(false);
  });
});
