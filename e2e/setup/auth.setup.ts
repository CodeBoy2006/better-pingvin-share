import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { configureSmokeDefaults } from "../helpers/config";

const adminCredentials = {
  email: "admin.e2e@example.com",
  password: "Password123!",
  username: "admin_e2e",
};

const userCredentials = {
  email: "user.e2e@example.com",
  password: "Password123!",
  username: "user_e2e",
};

const signUp = async (
  requestContext: APIRequestContext,
  credentials: typeof adminCredentials,
) => {
  const response = await requestContext.post("/api/auth/signUp", {
    data: credentials,
  });

  if (!response.ok()) {
    throw new Error(
      `Sign-up failed with ${response.status()}: ${await response.text()}`,
    );
  }
};

const assertCurrentUser = async (
  requestContext: APIRequestContext,
  expected: {
    email: string;
    isAdmin: boolean;
    username: string;
  },
) => {
  const response = await requestContext.get("/api/users/me");
  expect(response.ok()).toBeTruthy();
  const user = await response.json();
  expect(user.email).toBe(expected.email);
  expect(user.isAdmin).toBe(expected.isAdmin);
  expect(user.username).toBe(expected.username);
};

test("bootstrap browser storage states", async ({
  baseURL,
  playwright,
}) => {
  const authDir = process.env.PLAYWRIGHT_AUTH_DIR;

  if (!authDir) {
    throw new Error("PLAYWRIGHT_AUTH_DIR must be configured for the setup project.");
  }

  fs.mkdirSync(authDir, { recursive: true });

  const adminStorageStatePath = path.join(authDir, "admin.json");
  const userStorageStatePath = path.join(authDir, "user.json");

  const adminSession = await playwright.request.newContext({
    baseURL: baseURL!,
  });

  await signUp(adminSession, adminCredentials);
  await assertCurrentUser(adminSession, {
    email: adminCredentials.email,
    isAdmin: true,
    username: adminCredentials.username,
  });
  await adminSession.storageState({ path: adminStorageStatePath });
  await adminSession.dispose();

  const adminApi = await playwright.request.newContext({
    baseURL: process.env.API_URL,
    storageState: adminStorageStatePath,
  });

  try {
    await configureSmokeDefaults(adminApi, {
      allowUnauthenticatedShares: false,
      baseURL: baseURL!,
    });
  } finally {
    await adminApi.dispose();
  }

  const userSession = await playwright.request.newContext({
    baseURL: baseURL!,
  });
  await signUp(userSession, userCredentials);
  await assertCurrentUser(userSession, {
    email: userCredentials.email,
    isAdmin: false,
    username: userCredentials.username,
  });
  await userSession.storageState({ path: userStorageStatePath });
  await userSession.dispose();
});
