import { beforeEach, describe, expect, it } from "vitest";
import type Config from "../../../src/types/config.type";
import { middleware } from "../../../src/middleware";
import { mockFetchJsonResponse } from "../../network";
import { NextRequest } from "next/server";

type MiddlewareConfigKey =
  | "general.showHomePage"
  | "legal.enabled"
  | "legal.imprintText"
  | "legal.imprintUrl"
  | "legal.privacyPolicyText"
  | "legal.privacyPolicyUrl"
  | "share.allowRegistration"
  | "share.allowUnauthenticatedShares"
  | "smtp.enabled";

type MiddlewareConfigValue = string | boolean;

const configTypes: Record<MiddlewareConfigKey, Config["type"]> = {
  "general.showHomePage": "boolean",
  "legal.enabled": "boolean",
  "legal.imprintText": "text",
  "legal.imprintUrl": "string",
  "legal.privacyPolicyText": "text",
  "legal.privacyPolicyUrl": "string",
  "share.allowRegistration": "boolean",
  "share.allowUnauthenticatedShares": "boolean",
  "smtp.enabled": "boolean",
};

const defaultConfigValues: Record<MiddlewareConfigKey, MiddlewareConfigValue> = {
  "general.showHomePage": true,
  "legal.enabled": true,
  "legal.imprintText": "Imprint text",
  "legal.imprintUrl": "",
  "legal.privacyPolicyText": "Privacy text",
  "legal.privacyPolicyUrl": "",
  "share.allowRegistration": true,
  "share.allowUnauthenticatedShares": false,
  "smtp.enabled": true,
};

const serializeConfigValue = (value: MiddlewareConfigValue) => {
  return typeof value === "boolean" ? String(value) : value;
};

const buildConfig = (
  overrides: Partial<Record<MiddlewareConfigKey, MiddlewareConfigValue>> = {},
): Config[] => {
  const values = {
    ...defaultConfigValues,
    ...overrides,
  };

  return (Object.keys(values) as MiddlewareConfigKey[]).map((key) => ({
    defaultValue: serializeConfigValue(defaultConfigValues[key]),
    key,
    type: configTypes[key],
    value: serializeConfigValue(values[key]),
  }));
};

const createRequest = (path: string, accessToken?: string) => {
  const headers = new Headers();

  if (accessToken) {
    headers.set("cookie", `access_token=${accessToken}`);
  }

  return new NextRequest(`http://localhost${path}`, { headers });
};

const createAccessToken = (payload: { exp: number; isAdmin: boolean }) => {
  return [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "",
  ].join(".");
};

const expectRedirectTo = (response: Response | undefined, path: string) => {
  expect(response?.headers.get("location")).toBe(
    new URL(path, "http://localhost").toString(),
  );
};

describe("middleware", () => {
  beforeEach(() => {
    mockFetchJsonResponse(buildConfig());
  });

  it("redirects disabled auth routes back to the home page", async () => {
    mockFetchJsonResponse(
      buildConfig({
        "share.allowRegistration": false,
      }),
    );

    const response = await middleware(createRequest("/auth/signUp"));

    expectRedirectTo(response, "/");
  });

  it("redirects password-reset routes when SMTP is disabled", async () => {
    mockFetchJsonResponse(
      buildConfig({
        "smtp.enabled": false,
      }),
    );

    const response = await middleware(
      createRequest("/auth/resetPassword/request"),
    );

    expectRedirectTo(response, "/");
  });

  it("redirects anonymous users on protected routes to the sign-in page", async () => {
    const response = await middleware(createRequest("/account/shares"));

    expectRedirectTo(
      response,
      "/auth/signIn?redirect=%2Faccount%2Fshares",
    );
  });

  it("treats invalid access tokens as anonymous", async () => {
    const response = await middleware(createRequest("/account", "not-a-jwt"));

    expectRedirectTo(response, "/auth/signIn?redirect=%2Faccount");
  });

  it("redirects authenticated users away from unauthenticated-only routes", async () => {
    const response = await middleware(
      createRequest(
        "/auth/signIn",
        createAccessToken({
          exp: Math.floor(Date.now() / 1000) + 3600,
          isAdmin: false,
        }),
      ),
    );

    expectRedirectTo(response, "/upload");
  });

  it("redirects non-admin users away from admin routes", async () => {
    const response = await middleware(
      createRequest(
        "/admin/config/general",
        createAccessToken({
          exp: Math.floor(Date.now() / 1000) + 3600,
          isAdmin: false,
        }),
      ),
    );

    expectRedirectTo(response, "/upload");
  });

  it("allows administrators to access admin routes", async () => {
    const response = await middleware(
      createRequest(
        "/admin/config/general",
        createAccessToken({
          exp: Math.floor(Date.now() / 1000) + 3600,
          isAdmin: true,
        }),
      ),
    );

    expect(response).toBeUndefined();
  });

  it("redirects the home page when it is disabled", async () => {
    mockFetchJsonResponse(
      buildConfig({
        "general.showHomePage": false,
      }),
    );

    const response = await middleware(createRequest("/"));

    expectRedirectTo(response, "/upload");
  });

  it("redirects legal pages to their configured external URLs", async () => {
    mockFetchJsonResponse(
      buildConfig({
        "legal.imprintText": "",
        "legal.imprintUrl": "https://example.com/imprint",
      }),
    );

    const response = await middleware(createRequest("/imprint"));

    expect(response?.headers.get("location")).toBe(
      "https://example.com/imprint",
    );
  });

  it("allows anonymous uploads when unauthenticated shares are enabled", async () => {
    mockFetchJsonResponse(
      buildConfig({
        "share.allowUnauthenticatedShares": true,
      }),
    );

    const response = await middleware(createRequest("/upload"));

    expect(response).toBeUndefined();
  });
});
