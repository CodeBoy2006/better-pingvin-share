import path from "node:path";
import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

const resultsRoot = path.resolve(
  process.cwd(),
  process.env.TEST_RESULTS_DIR || "test-results",
);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: path.resolve(
          process.cwd(),
          process.env.PLAYWRIGHT_HTML_REPORT ||
            `${resultsRoot}/playwright/html`,
        ),
      },
    ],
    [
      "json",
      {
        outputFile: path.resolve(resultsRoot, "playwright/results.json"),
      },
    ],
  ],
  outputDir: path.resolve(
    process.cwd(),
    process.env.PLAYWRIGHT_OUTPUT_DIR || `${resultsRoot}/playwright/output`,
  ),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
