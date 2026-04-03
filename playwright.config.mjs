import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

dotenv.config({ path: path.resolve(process.cwd(), ".env.test") });

const getFreePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port =
        typeof address === "object" && address ? address.port : undefined;

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        if (!port) {
          reject(new Error("Unable to allocate a free port for Playwright."));
          return;
        }

        resolve(port);
      });
    });
  });

const isPortInUse = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      resolve(false);
    });
  });

const resultsRoot = path.resolve(
  process.cwd(),
  process.env.TEST_RESULTS_DIR || "test-results",
);
const manifestPath = path.resolve(
  process.cwd(),
  process.env.TEST_RUNTIME_ROOT || "tmp/test-runtime",
  "playwright-manifest.json",
);

let runtimeConfig;

if (fs.existsSync(manifestPath)) {
  const savedRuntimeConfig = JSON.parse(
    fs.readFileSync(manifestPath, "utf8"),
  );
  const savedPortsInUse = await Promise.all([
    isPortInUse(savedRuntimeConfig.backendPort),
    isPortInUse(savedRuntimeConfig.frontendPort),
  ]);

  if (savedPortsInUse.some(Boolean)) {
    runtimeConfig = savedRuntimeConfig;
  }
}

if (!runtimeConfig) {
  const backendPort = await getFreePort();
  const frontendPort = await getFreePort();
  const runtimeRoot = path.resolve(
    process.cwd(),
    process.env.TEST_RUNTIME_ROOT || "tmp/test-runtime",
    `playwright-${Date.now().toString(36)}`,
  );
  const dataDir = path.resolve(runtimeRoot, "backend-data");
  const configFile = path.resolve(runtimeRoot, "config.yaml");
  const databaseFilePath = path.resolve(dataDir, "pingvin-share.db");

  runtimeConfig = {
    apiURL: `http://127.0.0.1:${backendPort}`,
    authDir: path.resolve(resultsRoot, "playwright/.auth"),
    backendPort,
    baseURL: `http://127.0.0.1:${frontendPort}`,
    configFile,
    dataDir,
    databaseUrl: `file:${databaseFilePath}?connection_limit=1`,
    frontendPort,
    runtimeRoot,
  };

  fs.rmSync(runtimeConfig.authDir, { force: true, recursive: true });
  fs.mkdirSync(runtimeConfig.authDir, { recursive: true });
  fs.mkdirSync(resultsRoot, { recursive: true });
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(runtimeConfig, null, 2));
}

const {
  apiURL,
  authDir,
  backendPort,
  baseURL,
  configFile,
  dataDir,
  databaseUrl,
  frontendPort,
  runtimeRoot,
} = runtimeConfig;

process.env.API_URL = apiURL;
process.env.BACKEND_PORT = `${backendPort}`;
process.env.DATABASE_URL = databaseUrl;
process.env.PLAYWRIGHT_AUTH_DIR = authDir;
process.env.PLAYWRIGHT_BASE_URL = baseURL;
process.env.PLAYWRIGHT_RUNTIME_DIR = runtimeRoot;
process.env.PORT = `${frontendPort}`;

const stackEnv = {
  ...process.env,
  API_URL: apiURL,
  BACKEND_PORT: `${backendPort}`,
  CONFIG_FILE: configFile,
  DATA_DIRECTORY: dataDir,
  DATABASE_URL: databaseUrl,
  DISABLE_PWA: "true",
  NEXT_TELEMETRY_DISABLED: "1",
  PLAYWRIGHT_AUTH_DIR: authDir,
  PLAYWRIGHT_BASE_URL: baseURL,
  PLAYWRIGHT_RUNTIME_DIR: runtimeRoot,
  PORT: `${frontendPort}`,
  TEST_RESULTS_DIR: resultsRoot,
  TZ: process.env.TZ || "UTC",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
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
    [
      "junit",
      {
        outputFile: path.resolve(resultsRoot, "playwright/results.junit.xml"),
      },
    ],
  ],
  outputDir: path.resolve(
    process.cwd(),
    process.env.PLAYWRIGHT_OUTPUT_DIR || `${resultsRoot}/playwright/output`,
  ),
  use: {
    acceptDownloads: true,
    baseURL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node ./e2e/scripts/start-stack.mjs",
    env: stackEnv,
    reuseExistingServer: false,
    timeout: 240_000,
    url: baseURL,
  },
  projects: [
    {
      name: "setup",
      testMatch: /setup\/.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /setup\/.*\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
