import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const backendDir = path.resolve(rootDir, "backend");
const prismaBin = path.resolve(backendDir, "node_modules/.bin/prisma");
const nestBin = path.resolve(backendDir, "node_modules/.bin/nest");
const newmanBin = path.resolve(backendDir, "node_modules/.bin/newman");

dotenv.config({ path: path.resolve(rootDir, ".env.test") });

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const value = argv[index + 1];

    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function createLogStream(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  return fs.createWriteStream(filePath, { flags: "a" });
}

function pipeOutput(stream, target, logStream) {
  stream.on("data", (chunk) => {
    target.write(chunk);
    logStream.write(chunk);
  });
}

function runCommand(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const logStream = createLogStream(options.logFilePath);

    pipeOutput(child.stdout, process.stdout, logStream);
    pipeOutput(child.stderr, process.stderr, logStream);

    child.on("error", (error) => {
      logStream.end();
      reject(error);
    });

    child.on("close", (code) => {
      logStream.end();

      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`,
        ),
      );
    });
  });
}

function startServer(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logStream = createLogStream(options.logFilePath);

  pipeOutput(child.stdout, process.stdout, logStream);
  pipeOutput(child.stderr, process.stderr, logStream);

  child.on("close", () => {
    logStream.end();
  });

  return child;
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }

      lastError = new Error(`Received ${response.status} from ${url}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Unable to resolve free port")));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function killProcessGroup(child) {
  if (!child.pid) {
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const collectionPath = args.collection;
  const scriptPath = args.script;
  const reportName = args["report-name"] || "system";

  if (!collectionPath) {
    throw new Error("A Newman collection must be provided via --collection");
  }

  const runtimeRoot = path.resolve(
    rootDir,
    process.env.TEST_RUNTIME_ROOT || "tmp/test-runtime",
  );
  const resultsRoot = path.resolve(
    rootDir,
    process.env.TEST_RESULTS_DIR || "test-results",
  );

  fs.mkdirSync(runtimeRoot, { recursive: true });

  const runtimeDir = fs.mkdtempSync(path.join(runtimeRoot, `${reportName}-`));
  const dataDir = path.join(runtimeDir, "data");
  const resultsDir = path.join(resultsRoot, "backend", "system", reportName);
  const databaseFilePath = path.join(dataDir, "pingvin-share.db");
  const prismaDir = path.join(backendDir, "prisma");
  const databaseUrl = `file:${path.relative(prismaDir, databaseFilePath)}?connection_limit=1`;
  const port = parseInt(
    process.env.SYSTEM_TEST_BACKEND_PORT || `${await getFreePort()}`,
    10,
  );
  const apiUrl = `http://127.0.0.1:${port}/api`;

  fs.rmSync(resultsDir, { force: true, recursive: true });
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.closeSync(fs.openSync(databaseFilePath, "a"));

  const env = {
    ...process.env,
    NODE_ENV: "test",
    TZ: process.env.TZ || "UTC",
    BACKEND_PORT: `${port}`,
    PORT: `${port}`,
    DATA_DIRECTORY: dataDir,
    DATABASE_URL: databaseUrl,
    SYSTEM_TEST_API_URL: apiUrl,
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    NO_UPDATE_NOTIFIER: "1",
    PATH: `${path.resolve(backendDir, "node_modules/.bin")}${path.delimiter}${process.env.PATH || ""}`,
  };

  await runCommand(prismaBin, ["migrate", "reset", "-f"], {
    cwd: backendDir,
    env,
    logFilePath: path.join(resultsDir, "prisma.log"),
  });

  const server = startServer(nestBin, ["start"], {
    cwd: backendDir,
    env,
    logFilePath: path.join(resultsDir, "backend.log"),
  });

  try {
    await waitForUrl(`${apiUrl}/configs`, 60_000);

    await runCommand(
      newmanBin,
      [
        "run",
        path.resolve(backendDir, collectionPath),
        "--env-var",
        `API_URL=${apiUrl}`,
        "--reporters",
        "cli,json",
        "--reporter-json-export",
        path.join(resultsDir, "newman.json"),
      ],
      {
        cwd: backendDir,
        env,
        logFilePath: path.join(resultsDir, "newman.log"),
      },
    );

    if (scriptPath) {
      await runCommand(
        process.execPath,
        [path.resolve(backendDir, scriptPath)],
        {
          cwd: backendDir,
          env,
          logFilePath: path.join(resultsDir, "script.log"),
        },
      );
    }
  } finally {
    killProcessGroup(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
