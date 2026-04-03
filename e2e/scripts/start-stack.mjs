import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.resolve(rootDir, ".env.test") });

const requiredEnvKeys = [
  "API_URL",
  "BACKEND_PORT",
  "CONFIG_FILE",
  "DATA_DIRECTORY",
  "DATABASE_URL",
  "PLAYWRIGHT_BASE_URL",
  "PLAYWRIGHT_RUNTIME_DIR",
  "PORT",
];

for (const key of requiredEnvKeys) {
  if (!process.env[key]) {
    throw new Error(`Missing required Playwright stack environment variable: ${key}`);
  }
}

const runtimeRoot = path.resolve(process.env.PLAYWRIGHT_RUNTIME_DIR);
const dataDirectory = path.resolve(process.env.DATA_DIRECTORY);
const configFile = path.resolve(process.env.CONFIG_FILE);
const databaseFile = path.resolve(dataDirectory, "pingvin-share.db");
const manifestPath = path.resolve(runtimeRoot, "manifest.json");
const backendHealthUrl = `${process.env.API_URL}/api/health`;

fs.mkdirSync(path.join(dataDirectory, "uploads", "_temp"), { recursive: true });
fs.mkdirSync(path.join(dataDirectory, "uploads", "shares"), { recursive: true });
fs.mkdirSync(path.dirname(configFile), { recursive: true });
fs.closeSync(fs.openSync(configFile, "a"));
fs.closeSync(fs.openSync(databaseFile, "a"));
fs.writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      apiURL: process.env.API_URL,
      backendPort: Number(process.env.BACKEND_PORT),
      baseURL: process.env.PLAYWRIGHT_BASE_URL,
      configFile,
      dataDirectory,
      databaseUrl: process.env.DATABASE_URL,
      frontendPort: Number(process.env.PORT),
      generatedAt: new Date().toISOString(),
      runtimeRoot,
    },
    null,
    2,
  ),
);

const runOrThrow = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }
};

const waitForUrl = async (url, timeoutMs = 120_000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, {
        headers: {
          "cache-control": "no-cache",
        },
      });

      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${url}`);
};

const spawnManaged = (command, args, label, options = {}) => {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk.toString()}`);
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk.toString()}`);
  });

  return child;
};

const killProcess = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.killed) {
      resolve();
      return;
    }

    child.once("exit", () => resolve());
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
    }, 5_000).unref();
  });

runOrThrow(
  "npx",
  ["prisma", "db", "push", "--skip-generate", "--schema", "prisma/schema.prisma"],
  {
    cwd: path.resolve(rootDir, "backend"),
  },
);

runOrThrow(
  "npx",
  ["prisma", "db", "seed"],
  {
    cwd: path.resolve(rootDir, "backend"),
  },
);

const backendProcess = spawnManaged(
  "npx",
  [
    "ts-node",
    "--project",
    "tsconfig.json",
    "--transpile-only",
    "-r",
    "tsconfig-paths/register",
    "src/main.ts",
  ],
  "backend",
  {
    cwd: path.resolve(rootDir, "backend"),
  },
);

await waitForUrl(backendHealthUrl, 120_000);

const frontendProcess = spawnManaged(
  "npm",
  [
    "--prefix",
    "frontend",
    "run",
    "dev",
    "--",
    "--hostname",
    "127.0.0.1",
    "--port",
    process.env.PORT,
  ],
  "frontend",
);

const shutdown = async (exitCode = 0) => {
  process.removeAllListeners("SIGINT");
  process.removeAllListeners("SIGTERM");
  await Promise.all([killProcess(frontendProcess), killProcess(backendProcess)]);
  process.exit(exitCode);
};

process.on("SIGINT", () => {
  void shutdown(0);
});
process.on("SIGTERM", () => {
  void shutdown(0);
});

const watchProcess = (child, name) =>
  new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      resolve({ code, name, signal });
    });
  });

const result = await Promise.race([
  watchProcess(backendProcess, "backend"),
  watchProcess(frontendProcess, "frontend"),
]);

const exitCode = result.code === 0 ? 0 : 1;
console.error(
  `${result.name} process exited unexpectedly with code ${result.code ?? "null"} and signal ${result.signal ?? "null"}`,
);
await shutdown(exitCode);
