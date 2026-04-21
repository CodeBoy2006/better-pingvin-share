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

  it("forwards query strings, falls back to JSON content type, and omits optional upstream headers when absent", async () => {
    const upstreamHeaders = new Headers();
    const fetchMock = vi.fn().mockResolvedValue({
      headers: upstreamHeaders,
      status: 200,
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    const setHeader = vi.fn();
    const end = vi.fn();
    const context = {
      params: { shareId: "folder name/and?symbols" },
      resolvedUrl: "/s/folder/files.json?token=abc&download=false",
      req: {
        headers: {},
      },
      res: {
        statusCode: 500,
        setHeader,
        end,
      },
    } as any;

    await proxyShareFileListResponse(context);

    const apiUrl = process.env.API_URL || "http://localhost:8080";

    expect(fetchMock).toHaveBeenCalledWith(
      `${apiUrl}/api/shares/folder%20name%2Fand%3Fsymbols/files.json?token=abc&download=false`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "application/json",
          Cookie: "",
        }),
      }),
    );
    expect(context.res.statusCode).toBe(200);
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/json; charset=utf-8",
    );
    expect(setHeader).not.toHaveBeenCalledWith("Set-Cookie", expect.anything());
    expect(end).toHaveBeenCalledWith('{"ok":true}');
  });

  it("overrides cache-related headers with upstream values when they are present", async () => {
    const upstreamHeaders = new Headers({
      "cache-control": "public, max-age=60",
      vary: "Cookie, Accept-Encoding",
      "x-robots-tag": "none",
      "content-type": "application/problem+json",
    }) as Headers & {
      getSetCookie?: () => string[];
    };

    const fetchMock = vi.fn().mockResolvedValue({
      headers: upstreamHeaders,
      status: 503,
      text: vi.fn().mockResolvedValue('{"error":"upstream"}'),
    });
    vi.stubGlobal("fetch", fetchMock);

    const setHeader = vi.fn();
    const end = vi.fn();
    const context = {
      params: { shareId: "demo" },
      resolvedUrl: "/share/demo/files.json",
      req: {
        headers: {
          cookie: "share_demo_token=token",
        },
      },
      res: {
        statusCode: 200,
        setHeader,
        end,
      },
    } as any;

    await proxyShareFileListResponse(context);

    expect(setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "public, max-age=60",
    );
    expect(setHeader).toHaveBeenCalledWith("Vary", "Cookie, Accept-Encoding");
    expect(setHeader).toHaveBeenCalledWith("X-Robots-Tag", "none");
    expect(setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/problem+json",
    );
    expect(context.res.statusCode).toBe(503);
  });
});
