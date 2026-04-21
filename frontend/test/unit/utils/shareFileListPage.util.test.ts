import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyShareFileListResponse } from "../../../src/utils/shareFileListPage.util";

describe("shareFileListPage.util", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("always applies private no-store headers to proxied files.json responses", async () => {
    const upstreamHeaders = new Headers({
      "content-type": "application/json; charset=utf-8",
    }) as Headers & {
      getSetCookie?: () => string[];
    };
    upstreamHeaders.getSetCookie = () => ["share_demo_token=fresh-token"];

    const fetchMock = vi.fn().mockResolvedValue({
      headers: upstreamHeaders,
      status: 404,
      text: vi.fn().mockResolvedValue('{"error":"Share not found"}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    const setHeader = vi.fn();
    const end = vi.fn();
    const context = {
      params: { shareId: "demo" },
      resolvedUrl: "/s/demo/files.json",
      req: {
        headers: {
          cookie: "share_demo_token=stale-token",
        },
      },
      res: {
        statusCode: 200,
        setHeader,
        end,
      },
    } as any;

    await proxyShareFileListResponse(context);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/shares\/demo\/files\.json$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          Cookie: "share_demo_token=stale-token",
        }),
      }),
    );
    expect(context.res.statusCode).toBe(404);
    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate",
    );
    expect(setHeader).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(setHeader).toHaveBeenCalledWith("Expires", "0");
    expect(setHeader).toHaveBeenCalledWith("Vary", "Cookie");
    expect(setHeader).toHaveBeenCalledWith("X-Robots-Tag", "noindex, nofollow");
    expect(setHeader).toHaveBeenCalledWith("Set-Cookie", [
      "share_demo_token=fresh-token",
    ]);
    expect(end).toHaveBeenCalledWith('{"error":"Share not found"}');
  });
});
