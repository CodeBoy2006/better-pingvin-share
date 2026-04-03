import fs from "node:fs";
import path from "node:path";
import type {
  APIRequestContext,
  BrowserContext,
  Page,
} from "@playwright/test";
import { expect, test as base } from "@playwright/test";

type Role = "admin" | "user";

export type TestApp = {
  apiURL: string;
  authDir: string;
  baseURL: string;
  storageStatePath: (role: Role) => string;
  uniqueId: (prefix: string) => string;
};

type TestFixtures = {
  adminApi: APIRequestContext;
  adminContext: BrowserContext;
  adminPage: Page;
  app: TestApp;
  userApi: APIRequestContext;
  userContext: BrowserContext;
  userPage: Page;
};

const authDir = process.env.PLAYWRIGHT_AUTH_DIR
  ? path.resolve(process.env.PLAYWRIGHT_AUTH_DIR)
  : path.resolve(process.cwd(), "test-results/playwright/.auth");

const resolveStorageStatePath = (role: Role) => path.join(authDir, `${role}.json`);

const assertStorageStateExists = (role: Role) => {
  const storageStatePath = resolveStorageStatePath(role);

  if (!fs.existsSync(storageStatePath)) {
    throw new Error(
      `Missing Playwright auth state for ${role}: ${storageStatePath}. Run the setup project first.`,
    );
  }
};

export const test = base.extend<TestFixtures>({
  app: async ({ baseURL }, use) => {
    const resolvedBaseURL = baseURL ?? process.env.PLAYWRIGHT_BASE_URL;
    const apiURL = process.env.API_URL;

    if (!resolvedBaseURL) {
      throw new Error("Playwright baseURL is required for the E2E fixtures.");
    }

    if (!apiURL) {
      throw new Error("API_URL must be defined for the E2E fixtures.");
    }

    await use({
      apiURL,
      authDir,
      baseURL: resolvedBaseURL,
      storageStatePath: resolveStorageStatePath,
      uniqueId: (prefix: string) =>
        `${prefix}-${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
    });
  },
  adminContext: async ({ app, browser }, use) => {
    assertStorageStateExists("admin");
    const context = await browser.newContext({
      acceptDownloads: true,
      storageState: app.storageStatePath("admin"),
    });

    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
  adminPage: async ({ adminContext }, use) => {
    const page = await adminContext.newPage();

    try {
      await use(page);
    } finally {
      await page.close();
    }
  },
  adminApi: async ({ app, playwright }, use) => {
    assertStorageStateExists("admin");
    const api = await playwright.request.newContext({
      baseURL: app.apiURL,
      storageState: app.storageStatePath("admin"),
    });

    try {
      await use(api);
    } finally {
      await api.dispose();
    }
  },
  userContext: async ({ app, browser }, use) => {
    assertStorageStateExists("user");
    const context = await browser.newContext({
      acceptDownloads: true,
      storageState: app.storageStatePath("user"),
    });

    try {
      await use(context);
    } finally {
      await context.close();
    }
  },
  userPage: async ({ userContext }, use) => {
    const page = await userContext.newPage();

    try {
      await use(page);
    } finally {
      await page.close();
    }
  },
  userApi: async ({ app, playwright }, use) => {
    assertStorageStateExists("user");
    const api = await playwright.request.newContext({
      baseURL: app.apiURL,
      storageState: app.storageStatePath("user"),
    });

    try {
      await use(api);
    } finally {
      await api.dispose();
    }
  },
});

export { expect };
