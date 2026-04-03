import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const rootDir = path.resolve(__dirname, "../..");
const backendDir = path.resolve(rootDir, "backend");
const prismaBin = path.resolve(backendDir, "node_modules/.bin/prisma");
const nestBin = path.resolve(backendDir, "node_modules/.bin/nest");
const newman = require(path.resolve(backendDir, "node_modules/newman"));

const defaultEnvironmentFile = "./test/system/environments/runtime.postman_environment.json";
const defaultSuitesDir = "./test/system/suites";

loadEnvFile(path.resolve(rootDir, ".env.test"));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) {
      continue;
    }

    let value = rawValue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value.replace(/\\n/g, "\n");
  }
}

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function relativeLink(fromDir, targetPath) {
  return path.relative(fromDir, targetPath).split(path.sep).join("/");
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

async function stopServer(child) {
  if (!child?.pid) {
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}

  await delay(1_000);

  try {
    process.kill(-child.pid, 0);
    process.kill(-child.pid, "SIGKILL");
  } catch {}
}

function resolveBackendPath(filePath) {
  return path.isAbsolute(filePath) ? filePath : path.resolve(backendDir, filePath);
}

function toJson(value) {
  if (!value) {
    return value;
  }

  if (typeof value.toJSON === "function") {
    return value.toJSON();
  }

  return value;
}

function normalizeHeaders(headers) {
  if (!headers) {
    return {};
  }

  if (typeof headers.toJSON === "function") {
    const json = headers.toJSON();

    if (Array.isArray(json)) {
      return Object.fromEntries(
        json.map((entry) => [entry.key ?? entry.name, entry.value]),
      );
    }

    return json;
  }

  if (typeof headers.entries === "function") {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(
      headers.map((entry) => [entry.key ?? entry.name, entry.value]),
    );
  }

  return headers;
}

function previewText(text, limit = 16_000) {
  if (text.length <= limit) {
    return {
      value: text,
      truncated: false,
      originalLength: text.length,
    };
  }

  return {
    value: text.slice(0, limit),
    truncated: true,
    originalLength: text.length,
  };
}

function serializeBuffer(buffer, contentType) {
  const hash = createHash("sha256").update(buffer).digest("hex");

  if (!buffer.length) {
    return {
      kind: "empty",
      byteLength: 0,
      sha256: hash,
    };
  }

  const normalizedType = (contentType || "").toLowerCase();
  const isText =
    normalizedType.includes("json") ||
    normalizedType.includes("xml") ||
    normalizedType.includes("text") ||
    normalizedType.includes("javascript") ||
    normalizedType.includes("html") ||
    normalizedType.includes("x-www-form-urlencoded") ||
    normalizedType.endsWith("+json");

  if (isText) {
    const textPreview = previewText(buffer.toString("utf8"));

    return {
      kind: "text",
      byteLength: buffer.length,
      sha256: hash,
      text: textPreview.value,
      truncated: textPreview.truncated,
      originalLength: textPreview.originalLength,
    };
  }

  const base64 = buffer.toString("base64");
  const previewLength = 4_096;

  return {
    kind: "binary",
    byteLength: buffer.length,
    sha256: hash,
    base64: base64.slice(0, previewLength),
    truncated: base64.length > previewLength,
    originalBase64Length: base64.length,
  };
}

function serializeRequestBody(body) {
  if (!body) {
    return null;
  }

  return toJson(body);
}

function getItemPath(item) {
  const names = [];
  let current = item;

  while (current?.name) {
    names.unshift(current.name);

    if (typeof current.parent !== "function") {
      break;
    }

    current = current.parent();

    if (!current?.name) {
      break;
    }
  }

  return names.join(" / ");
}

function serializeError(error) {
  if (!error) {
    return null;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

function simplifyFailure(failure) {
  const json = toJson(failure) ?? failure ?? {};

  return {
    source: json.source ?? json.at ?? json.item ?? null,
    parent: json.parent ?? null,
    cursor: json.cursor ?? null,
    error: serializeError(json.error ?? json),
  };
}

function createSnapshotWriter(snapshotsDir) {
  let index = 0;
  const files = [];

  return {
    files,
    write(name, payload) {
      index += 1;
      const filePath = path.join(
        snapshotsDir,
        `${String(index).padStart(2, "0")}-${slugify(name || `snapshot-${index}`)}.json`,
      );

      writeJson(filePath, payload);
      files.push(filePath);
      return filePath;
    },
  };
}

function cloneCollection(collection) {
  return JSON.parse(JSON.stringify(collection));
}

function splitItemPath(itemPath) {
  return itemPath
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
}

function isPathPrefix(prefix, candidate) {
  if (prefix.length > candidate.length) {
    return false;
  }

  return prefix.every((part, index) => part === candidate[index]);
}

function filterCollection(collection, includes, stepName) {
  if (!includes?.length) {
    return cloneCollection(collection);
  }

  const includePaths = includes.map(splitItemPath);

  const walk = (item, ancestors = []) => {
    const currentPath = [...ancestors, item.name];
    const relevantPaths = includePaths.filter(
      (includePath) =>
        isPathPrefix(currentPath, includePath) ||
        isPathPrefix(includePath, currentPath),
    );

    if (relevantPaths.length === 0) {
      return null;
    }

    const exactMatch = relevantPaths.some(
      (includePath) =>
        includePath.length === currentPath.length &&
        includePath.every((part, index) => part === currentPath[index]),
    );

    if (!Array.isArray(item.item) || item.item.length === 0 || exactMatch) {
      return cloneCollection(item);
    }

    const children = item.item
      .map((child) => walk(child, currentPath))
      .filter(Boolean);

    if (children.length === 0) {
      return exactMatch ? cloneCollection(item) : null;
    }

    const clonedItem = cloneCollection(item);
    clonedItem.item = children;
    return clonedItem;
  };

  const filteredCollection = cloneCollection(collection);
  filteredCollection.info = {
    ...filteredCollection.info,
    name: `${filteredCollection.info?.name ?? "Collection"} [${stepName}]`,
  };
  filteredCollection.item = (filteredCollection.item ?? [])
    .map((item) => walk(item))
    .filter(Boolean);

  return filteredCollection;
}

function renderLinks(links) {
  if (!links?.length) {
    return "<p>None.</p>";
  }

  return `<ul>${links
    .map(
      (link) =>
        `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`,
    )
    .join("")}</ul>`;
}

function renderNewmanHtml(stepSummary) {
  const statsRows = Object.entries(stepSummary.stats ?? {})
    .map(
      ([name, value]) =>
        `<tr><th>${escapeHtml(name)}</th><td>${escapeHtml(JSON.stringify(value))}</td></tr>`,
    )
    .join("");
  const failureRows = (stepSummary.failures ?? [])
    .map((failure) => {
      const source =
        failure.source?.name ||
        failure.source?.id ||
        failure.parent?.name ||
        failure.parent?.id ||
        "Unknown source";
      return `<li><strong>${escapeHtml(source)}</strong>: ${escapeHtml(
        failure.error?.message ?? "Unknown failure",
      )}</li>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(stepSummary.reportName)}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 960px; color: #111827; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }
      th, td { border: 1px solid #d1d5db; padding: 0.5rem; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; }
      .status-passed { color: #166534; }
      .status-failed { color: #991b1b; }
      code { background: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 0.25rem; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(stepSummary.reportName)}</h1>
    <p>Status: <strong class="status-${escapeHtml(stepSummary.status)}">${escapeHtml(stepSummary.status)}</strong></p>
    <table>
      <tbody>
        <tr><th>Collection</th><td><code>${escapeHtml(stepSummary.collection)}</code></td></tr>
        <tr><th>Started</th><td>${escapeHtml(stepSummary.startedAt)}</td></tr>
        <tr><th>Finished</th><td>${escapeHtml(stepSummary.finishedAt)}</td></tr>
        <tr><th>Duration</th><td>${escapeHtml(`${stepSummary.durationMs}ms`)}</td></tr>
      </tbody>
    </table>
    <h2>Artifacts</h2>
    ${renderLinks([
      { href: stepSummary.artifacts.json, label: "Newman JSON" },
      { href: stepSummary.artifacts.junit, label: "JUnit XML" },
      { href: stepSummary.artifacts.exportedEnvironment, label: "Environment export" },
      { href: stepSummary.artifacts.exportedCollection, label: "Collection export" },
      { href: stepSummary.artifacts.diagnostics, label: "Diagnostics log" },
      { href: "summary.json", label: "Step summary JSON" },
    ])}
    <h2>Stats</h2>
    <table>
      <tbody>${statsRows || '<tr><td colspan="2">No stats captured.</td></tr>'}</tbody>
    </table>
    <h2>Failures</h2>
    ${failureRows ? `<ul>${failureRows}</ul>` : "<p>None.</p>"}
    <h2>Snapshots</h2>
    ${renderLinks(
      (stepSummary.snapshotFiles ?? []).map((filePath) => ({
        href: filePath,
        label: filePath,
      })),
    )}
  </body>
</html>
`;
}

function renderScriptHtml(stepSummary) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(stepSummary.reportName)}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 960px; color: #111827; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }
      th, td { border: 1px solid #d1d5db; padding: 0.5rem; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; }
      .status-passed { color: #166534; }
      .status-failed { color: #991b1b; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(stepSummary.reportName)}</h1>
    <p>Status: <strong class="status-${escapeHtml(stepSummary.status)}">${escapeHtml(stepSummary.status)}</strong></p>
    <table>
      <tbody>
        <tr><th>Script</th><td><code>${escapeHtml(stepSummary.script ?? "n/a")}</code></td></tr>
        <tr><th>Started</th><td>${escapeHtml(stepSummary.startedAt)}</td></tr>
        <tr><th>Finished</th><td>${escapeHtml(stepSummary.finishedAt)}</td></tr>
        <tr><th>Duration</th><td>${escapeHtml(`${stepSummary.durationMs}ms`)}</td></tr>
      </tbody>
    </table>
    <h2>Artifacts</h2>
    ${renderLinks([
      { href: stepSummary.artifacts.log, label: "Script log" },
      { href: "summary.json", label: "Step summary JSON" },
      ...((stepSummary.requests ?? []).map((request) => ({
        href: request.snapshot,
        label: `${request.name} (${request.status})`,
      })) || []),
    ])}
    <h2>Error</h2>
    <pre>${escapeHtml(
      stepSummary.error?.stack || stepSummary.error?.message || "None",
    )}</pre>
  </body>
</html>
`;
}

function renderSuiteHtml(suiteSummary) {
  const rows = suiteSummary.steps
    .map(
      (step) => `
        <tr>
          <td>${escapeHtml(step.reportName)}</td>
          <td>${escapeHtml(step.type)}</td>
          <td class="status-${escapeHtml(step.status)}">${escapeHtml(step.status)}</td>
          <td>${escapeHtml(`${step.durationMs}ms`)}</td>
          <td><a href="${escapeHtml(path.posix.join(step.directory, "report.html"))}">report</a></td>
        </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(suiteSummary.name)}</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem auto; max-width: 1080px; color: #111827; }
      table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; }
      th, td { border: 1px solid #d1d5db; padding: 0.5rem; text-align: left; vertical-align: top; }
      th { background: #f3f4f6; }
      .status-passed { color: #166534; }
      .status-failed { color: #991b1b; }
      code { background: #f3f4f6; padding: 0.125rem 0.25rem; border-radius: 0.25rem; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(suiteSummary.name)}</h1>
    <p>${escapeHtml(suiteSummary.description || "Backend API black-box regression suite")}</p>
    <p>Status: <strong class="status-${escapeHtml(suiteSummary.status)}">${escapeHtml(suiteSummary.status)}</strong></p>
    <table>
      <tbody>
        <tr><th>Started</th><td>${escapeHtml(suiteSummary.startedAt)}</td></tr>
        <tr><th>Finished</th><td>${escapeHtml(suiteSummary.finishedAt)}</td></tr>
        <tr><th>Duration</th><td>${escapeHtml(`${suiteSummary.durationMs}ms`)}</td></tr>
        <tr><th>API URL</th><td><code>${escapeHtml(suiteSummary.runtime.apiUrl)}</code></td></tr>
        <tr><th>Runtime dir</th><td><code>${escapeHtml(suiteSummary.runtime.runtimeDir)}</code></td></tr>
      </tbody>
    </table>
    <h2>Logs</h2>
    ${renderLinks([
      { href: suiteSummary.artifacts.prismaLog, label: "Prisma reset log" },
      { href: suiteSummary.artifacts.backendLog, label: "Backend log" },
      { href: suiteSummary.artifacts.runtimeJson, label: "Runtime JSON" },
      { href: suiteSummary.artifacts.suiteJson, label: "Suite JSON" },
    ])}
    <h2>Steps</h2>
    <table>
      <thead>
        <tr>
          <th>Step</th>
          <th>Type</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Report</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <h2>Error</h2>
    <pre>${escapeHtml(
      suiteSummary.error?.stack || suiteSummary.error?.message || "None",
    )}</pre>
  </body>
</html>
`;
}

function buildStepDirectories(resultsDir, index, step) {
  const stepDir = path.join(
    resultsDir,
    `${String(index).padStart(2, "0")}-${slugify(step.reportName ?? step.id ?? step.type)}`,
  );

  fs.mkdirSync(path.join(stepDir, "snapshots"), { recursive: true });

  return {
    stepDir,
    snapshotsDir: path.join(stepDir, "snapshots"),
    json: path.join(stepDir, "newman.json"),
    junit: path.join(stepDir, "newman.junit.xml"),
    html: path.join(stepDir, "report.html"),
    summary: path.join(stepDir, "summary.json"),
    diagnostics: path.join(stepDir, "diagnostics.log"),
    exportedEnvironment: path.join(stepDir, "environment.after.json"),
    exportedCollection: path.join(stepDir, "collection.after.json"),
    scriptLog: path.join(stepDir, "script.log"),
  };
}

function buildRuntimeVariables(suiteName, apiUrl) {
  return {
    API_URL: apiUrl,
    SYSTEM_TEST_RUN_ID: randomUUID().replaceAll("-", "").slice(0, 10),
    SYSTEM_TEST_SUITE: suiteName,
    SYSTEM_TEST_APP_URL: process.env.SYSTEM_TEST_APP_URL || "http://localhost:3000",
    SYSTEM_TEST_ADMIN_EMAIL:
      process.env.SYSTEM_TEST_ADMIN_EMAIL || "system@test.org",
    SYSTEM_TEST_ADMIN_PASSWORD:
      process.env.SYSTEM_TEST_ADMIN_PASSWORD || "J2y8unpJUcJDRv",
  };
}

async function runNewmanStep({
  step,
  environmentFile,
  runtimeVariables,
  resultsDir,
  stepIndex,
}) {
  const stepPaths = buildStepDirectories(resultsDir, stepIndex, step);
  const collection = readJson(resolveBackendPath(step.collection));
  const filteredCollection = filterCollection(
    collection,
    step.includes,
    step.reportName ?? step.id,
  );
  const snapshotWriter = createSnapshotWriter(stepPaths.snapshotsDir);
  const diagnostics = [
    `step=${step.id}`,
    `collection=${step.collection}`,
    `environment=${step.environment ?? environmentFile}`,
  ];
  const startedAt = Date.now();

  const envVar = {
    ...runtimeVariables,
    ...(step.env ?? {}),
    SYSTEM_TEST_STEP_ID: step.id,
    SYSTEM_TEST_STEP_DIR: stepPaths.stepDir,
    SYSTEM_TEST_SNAPSHOTS_DIR: stepPaths.snapshotsDir,
  };

  return await new Promise((resolve, reject) => {
    const emitter = newman.run(
      {
        collection: filteredCollection,
        environment: resolveBackendPath(step.environment ?? environmentFile),
        envVar: Object.entries(envVar).map(([key, value]) => ({
          key,
          value: `${value}`,
        })),
        workingDir: backendDir,
        insecureFileRead: true,
        reporters: ["cli", "json", "junit"],
        reporter: {
          cli: {
            showTimestamps: true,
          },
          json: {
            export: stepPaths.json,
          },
          junit: {
            export: stepPaths.junit,
          },
        },
        exportEnvironment: stepPaths.exportedEnvironment,
        exportCollection: stepPaths.exportedCollection,
        color: process.stdout.isTTY ? "auto" : "off",
      },
      (error, summary) => {
        const finishedAt = Date.now();
        const failures = summary?.run?.failures?.map(simplifyFailure) ?? [];

        if (error) {
          diagnostics.push(`newmanError=${error.message}`);
        }

        if (summary?.error) {
          diagnostics.push(`summaryError=${summary.error.message}`);
        }

        if (failures.length > 0) {
          diagnostics.push("failures:");
          for (const failure of failures) {
            diagnostics.push(`- ${failure.error?.message ?? "Unknown failure"}`);
          }
        }

        writeText(stepPaths.diagnostics, `${diagnostics.join("\n")}\n`);

        const stepSummary = {
          type: "newman",
          id: step.id,
          reportName: step.reportName ?? step.id,
          status:
            error || summary?.error || failures.length > 0 ? "failed" : "passed",
          collection: step.collection,
          includes: step.includes ?? null,
          startedAt: new Date(startedAt).toISOString(),
          finishedAt: new Date(finishedAt).toISOString(),
          durationMs: finishedAt - startedAt,
          stats: summary?.run?.stats ?? null,
          failures,
          snapshotFiles: snapshotWriter.files.map((filePath) =>
            relativeLink(stepPaths.stepDir, filePath),
          ),
          artifacts: {
            diagnostics: path.basename(stepPaths.diagnostics),
            json: path.basename(stepPaths.json),
            junit: path.basename(stepPaths.junit),
            html: path.basename(stepPaths.html),
            exportedEnvironment: path.basename(stepPaths.exportedEnvironment),
            exportedCollection: path.basename(stepPaths.exportedCollection),
          },
        };

        writeJson(stepPaths.summary, stepSummary);
        writeText(stepPaths.html, renderNewmanHtml(stepSummary));

        const failureError =
          error ??
          summary?.error ??
          (failures.length > 0
            ? new Error(`${step.id} reported ${failures.length} Newman failure(s)`)
            : null);

        if (failureError) {
          failureError.stepSummary = stepSummary;
          failureError.stepPaths = stepPaths;
          reject(failureError);
          return;
        }

        resolve({ stepSummary, stepPaths });
      },
    );

    emitter.on("request", (error, args) => {
      const requestUrl = args?.request?.url?.toString?.() ?? "<unknown>";
      const requestMethod = args?.request?.method ?? "REQUEST";
      const responseHeaders = normalizeHeaders(args?.response?.headers);
      const contentType =
        responseHeaders["content-type"] ?? responseHeaders["Content-Type"] ?? "";
      const snapshotPath = snapshotWriter.write(args?.item?.name ?? requestMethod, {
        stepId: step.id,
        cursor: args?.cursor ?? null,
        itemPath: getItemPath(args?.item),
        request: {
          method: requestMethod,
          url: requestUrl,
          headers: normalizeHeaders(args?.request?.headers),
          body: serializeRequestBody(args?.request?.body),
        },
        response: {
          code: args?.response?.code ?? null,
          status: args?.response?.status ?? null,
          headers: responseHeaders,
          body: serializeBuffer(Buffer.from(args?.response?.stream ?? []), contentType),
        },
        error: serializeError(error),
      });

      diagnostics.push(
        `${requestMethod} ${requestUrl} -> ${args?.response?.code ?? "ERR"} [${path.basename(snapshotPath)}]`,
      );
    });

    emitter.on("console", (error, args) => {
      if (error) {
        diagnostics.push(`consoleError=${error.message}`);
      }

      diagnostics.push(
        `console:${args?.level ?? "log"}:${(args?.messages ?? [])
          .map((message) => String(message))
          .join(" ")}`,
      );
    });

    emitter.on("exception", (error, args) => {
      diagnostics.push(`exception=${error?.message ?? "unknown exception"}`);

      if (args?.cursor) {
        diagnostics.push(`exceptionCursor=${JSON.stringify(args.cursor)}`);
      }
    });
  });
}

async function runScriptStep({ step, runtimeVariables, resultsDir, stepIndex }) {
  const stepPaths = buildStepDirectories(resultsDir, stepIndex, step);
  const startedAt = Date.now();
  const env = {
    ...process.env,
    ...runtimeVariables,
    ...(step.env ?? {}),
    SYSTEM_TEST_STEP_ID: step.id,
    SYSTEM_TEST_STEP_DIR: stepPaths.stepDir,
    SYSTEM_TEST_SNAPSHOTS_DIR: stepPaths.snapshotsDir,
    SYSTEM_TEST_API_URL: runtimeVariables.API_URL,
  };

  try {
    await runCommand(process.execPath, [resolveBackendPath(step.script)], {
      cwd: backendDir,
      env,
      logFilePath: stepPaths.scriptLog,
    });
  } catch (error) {
    const finishedAt = Date.now();
    const existingSummary = fs.existsSync(stepPaths.summary)
      ? readJson(stepPaths.summary)
      : null;
    const stepSummary = existingSummary ?? {
      type: "script",
      id: step.id,
      reportName: step.reportName ?? step.id,
      script: step.script,
      status: "failed",
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      requests: [],
      error: serializeError(error),
      artifacts: {
        log: path.basename(stepPaths.scriptLog),
      },
    };

    writeJson(stepPaths.summary, stepSummary);

    if (!fs.existsSync(stepPaths.html)) {
      writeText(stepPaths.html, renderScriptHtml(stepSummary));
    }

    error.stepSummary = stepSummary;
    error.stepPaths = stepPaths;
    throw error;
  }

  const finishedAt = Date.now();
  const existingSummary = fs.existsSync(stepPaths.summary)
    ? readJson(stepPaths.summary)
    : null;
  const stepSummary = existingSummary ?? {
    type: "script",
    id: step.id,
    reportName: step.reportName ?? step.id,
    script: step.script,
    status: "passed",
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    requests: [],
    error: null,
    artifacts: {
      log: path.basename(stepPaths.scriptLog),
    },
  };

  if (!fs.existsSync(stepPaths.summary)) {
    writeJson(stepPaths.summary, stepSummary);
  }

  if (!fs.existsSync(stepPaths.html)) {
    writeText(stepPaths.html, renderScriptHtml(stepSummary));
  }

  return { stepSummary, stepPaths };
}

function buildManifestFromArgs(args) {
  if (args.suite) {
    const manifestPath = resolveBackendPath(
      path.join(defaultSuitesDir, `${args.suite}.json`),
    );

    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Unknown backend system suite: ${args.suite}`);
    }

    return {
      suiteName: args.suite,
      manifest: readJson(manifestPath),
    };
  }

  if (!args.collection) {
    throw new Error(
      "Provide either --suite <name> or --collection <path> to run backend system tests.",
    );
  }

  const reportName = args["report-name"] || "system";

  return {
    suiteName: reportName,
    manifest: {
      name: reportName,
      description: "Ad-hoc backend API black-box regression run",
      environment: defaultEnvironmentFile,
      steps: [
        {
          id: reportName,
          type: "newman",
          reportName,
          collection: args.collection,
        },
        ...(args.script
          ? [
              {
                id: `${reportName}-script`,
                type: "script",
                reportName: `${reportName}-script`,
                script: args.script,
              },
            ]
          : []),
      ],
    },
  };
}

async function executeSuite(suiteName, manifest) {
  const runtimeRoot = path.resolve(
    rootDir,
    process.env.TEST_RUNTIME_ROOT || "tmp/test-runtime",
  );
  const resultsRoot = path.resolve(
    rootDir,
    process.env.TEST_RESULTS_DIR || "test-results",
  );

  fs.mkdirSync(runtimeRoot, { recursive: true });

  const runtimeDir = fs.mkdtempSync(path.join(runtimeRoot, `${suiteName}-`));
  const dataDir = path.join(runtimeDir, "data");
  const resultsDir = path.join(resultsRoot, "backend", "system", suiteName);
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

  const runtimeVariables = buildRuntimeVariables(suiteName, apiUrl);
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
    ...runtimeVariables,
  };

  const runtimeFilePath = path.join(resultsDir, "runtime.json");
  const prismaLogPath = path.join(resultsDir, "prisma.log");
  const backendLogPath = path.join(resultsDir, "backend.log");
  const suiteSummaryPath = path.join(resultsDir, "suite.json");
  const suiteHtmlPath = path.join(resultsDir, "index.html");

  writeJson(runtimeFilePath, {
    suiteName,
    runtimeDir,
    dataDir,
    resultsDir,
    databaseFilePath,
    apiUrl,
    port,
    environmentFile: manifest.environment ?? defaultEnvironmentFile,
  });

  await runCommand(prismaBin, ["migrate", "reset", "-f"], {
    cwd: backendDir,
    env,
    logFilePath: prismaLogPath,
  });

  const server = startServer(nestBin, ["start"], {
    cwd: backendDir,
    env,
    logFilePath: backendLogPath,
  });

  const suiteStartedAt = Date.now();
  const suiteSummary = {
    name: manifest.name ?? suiteName,
    description: manifest.description ?? null,
    status: "passed",
    startedAt: new Date(suiteStartedAt).toISOString(),
    finishedAt: null,
    durationMs: 0,
    runtime: {
      apiUrl,
      runtimeDir,
      resultsDir,
    },
    steps: [],
    artifacts: {
      prismaLog: path.basename(prismaLogPath),
      backendLog: path.basename(backendLogPath),
      runtimeJson: path.basename(runtimeFilePath),
      suiteJson: path.basename(suiteSummaryPath),
    },
    error: null,
  };
  const providedDependencies = new Set();

  try {
    await waitForUrl(`${apiUrl}/configs`, 60_000);

    const environmentFile = manifest.environment ?? defaultEnvironmentFile;

    for (const [index, step] of (manifest.steps ?? []).entries()) {
      for (const requirement of step.requires ?? []) {
        if (!providedDependencies.has(requirement)) {
          throw new Error(
            `Step ${step.id} is missing prerequisite \`${requirement}\`.`,
          );
        }
      }

      const executor = step.type === "script" ? runScriptStep : runNewmanStep;
      const { stepSummary, stepPaths } = await executor({
        step,
        environmentFile,
        runtimeVariables,
        resultsDir,
        stepIndex: index + 1,
      });

      suiteSummary.steps.push({
        ...stepSummary,
        directory: relativeLink(resultsDir, stepPaths.stepDir),
      });

      for (const provided of step.provides ?? []) {
        providedDependencies.add(provided);
      }
    }
  } catch (error) {
    suiteSummary.status = "failed";
    suiteSummary.error = serializeError(error);

    if (error.stepSummary && error.stepPaths) {
      suiteSummary.steps.push({
        ...error.stepSummary,
        directory: relativeLink(resultsDir, error.stepPaths.stepDir),
      });
    }
  } finally {
    await stopServer(server);
  }

  const suiteFinishedAt = Date.now();
  suiteSummary.finishedAt = new Date(suiteFinishedAt).toISOString();
  suiteSummary.durationMs = suiteFinishedAt - suiteStartedAt;

  writeJson(suiteSummaryPath, suiteSummary);
  writeText(suiteHtmlPath, renderSuiteHtml(suiteSummary));

  if (suiteSummary.status !== "passed") {
    throw new Error(
      `${suiteName} failed. See ${path.relative(rootDir, suiteSummaryPath)} for details.`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { suiteName, manifest } = buildManifestFromArgs(args);
  await executeSuite(suiteName, manifest);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
