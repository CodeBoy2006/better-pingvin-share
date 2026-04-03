import type { APIRequestContext } from "@playwright/test";
import { expect } from "../fixtures/test";

type ConfigUpdate = {
  key: string;
  value: boolean | number | string;
};

const stripTrailingSlash = (value: string) => value.replace(/\/$/, "");

export const updateAdminConfig = async (
  adminApi: APIRequestContext,
  updates: ConfigUpdate[],
) => {
  const response = await adminApi.patch("/api/configs/admin", {
    data: updates,
  });

  expect(response.ok()).toBeTruthy();
};

export const configureSmokeDefaults = async (
  adminApi: APIRequestContext,
  options: {
    allowUnauthenticatedShares?: boolean;
    baseURL: string;
  },
) => {
  await updateAdminConfig(adminApi, [
    {
      key: "general.appUrl",
      value: stripTrailingSlash(options.baseURL),
    },
    {
      key: "share.allowUnauthenticatedShares",
      value: options.allowUnauthenticatedShares ?? false,
    },
  ]);
};
