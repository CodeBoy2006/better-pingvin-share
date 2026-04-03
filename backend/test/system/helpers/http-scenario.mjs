import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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

function normalizeHeaders(headers) {
  if (!headers) {
    return {};
  }

  if (typeof headers.entries === "function") {
    return Object.fromEntries(headers.entries());
  }

  return headers;
}

function serializeBody(body, contentType) {
  if (body == null) {
    return null;
  }

  if (typeof body === "string") {
    const preview = previewText(body);

    return {
      kind: "text",
      text: preview.value,
      truncated: preview.truncated,
      originalLength: preview.originalLength,
    };
  }

  if (body instanceof URLSearchParams) {
    return serializeBody(body.toString(), "application/x-www-form-urlencoded");
  }

  if (Buffer.isBuffer(body)) {
    return serializeBuffer(body, contentType);
  }

  if (body instanceof Uint8Array) {
    return serializeBuffer(Buffer.from(body), contentType);
  }

  return body;
}

function renderScenarioHtml(summary) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(summary.reportName)}</title>
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
    <h1>${escapeHtml(summary.reportName)}</h1>
    <p>Status: <strong class="status-${escapeHtml(summary.status)}">${escapeHtml(summary.status)}</strong></p>
    <table>
      <tbody>
        <tr><th>Scenario</th><td>${escapeHtml(summary.scenarioName)}</td></tr>
        <tr><th>Started</th><td>${escapeHtml(summary.startedAt)}</td></tr>
        <tr><th>Finished</th><td>${escapeHtml(summary.finishedAt)}</td></tr>
        <tr><th>Duration</th><td>${escapeHtml(`${summary.durationMs}ms`)}</td></tr>
      </tbody>
    </table>
    <h2>Metadata</h2>
    <pre>${escapeHtml(JSON.stringify(summary.metadata ?? {}, null, 2))}</pre>
    <h2>Requests</h2>
    <ul>
      ${(summary.requests ?? [])
        .map(
          (request) =>
            `<li><a href="${escapeHtml(request.snapshot)}">${escapeHtml(request.name)}</a> — ${escapeHtml(String(request.status))}</li>`,
        )
        .join("")}
    </ul>
    <h2>Error</h2>
    <pre>${escapeHtml(summary.error?.stack || summary.error?.message || "None")}</pre>
  </body>
</html>
`;
}

export function getCookieHeader(response) {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  return setCookies
    .map((cookie) => cookie.split(";", 1)[0])
    .filter(Boolean)
    .join("; ");
}

export function serializeError(error) {
  if (!error) {
    return null;
  }

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

export function createScenarioHarness({ scenarioName, apiUrl, resultsDir }) {
  const snapshotsDir = path.join(resultsDir, "snapshots");
  const summaryPath = path.join(resultsDir, "summary.json");
  const reportPath = path.join(resultsDir, "report.html");
  const requests = [];
  let sequence = 0;
  const startedAt = Date.now();

  fs.mkdirSync(snapshotsDir, { recursive: true });

  const request = async (name, target, options = {}) => {
    sequence += 1;
    const url = target.startsWith("http://") || target.startsWith("https://")
      ? target
      : `${apiUrl}${target}`;
    const response = await fetch(url, options);
    const responseHeaders = normalizeHeaders(response.headers);
    const contentType = responseHeaders["content-type"] || "";
    const buffer = Buffer.from(await response.arrayBuffer());
    const body = serializeBuffer(buffer, contentType);
    const text = body.kind === "text" ? buffer.toString("utf8") : null;
    let json;

    if (body.kind === "text" && contentType.includes("application/json") && text) {
      json = JSON.parse(text);
    }

    const snapshotPath = path.join(
      snapshotsDir,
      `${String(sequence).padStart(2, "0")}-${slugify(name)}.json`,
    );

    writeJson(snapshotPath, {
      scenarioName,
      name,
      url,
      request: {
        method: options.method ?? "GET",
        headers: normalizeHeaders(new Headers(options.headers || {})),
        body: serializeBody(options.body, options.headers?.["Content-Type"]),
      },
      response: {
        status: response.status,
        headers: responseHeaders,
        body,
      },
    });

    requests.push({
      name,
      status: response.status,
      snapshot: path.relative(resultsDir, snapshotPath).split(path.sep).join("/"),
    });

    return {
      response,
      status: response.status,
      headers: response.headers,
      headersObject: responseHeaders,
      text,
      json,
      body,
    };
  };

  const finalize = ({ status, metadata = {}, error = null }) => {
    const finishedAt = Date.now();
    const summary = {
      type: "script",
      id: process.env.SYSTEM_TEST_STEP_ID || scenarioName,
      reportName: process.env.SYSTEM_TEST_STEP_ID || scenarioName,
      scenarioName,
      script: process.argv[1],
      status,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      metadata,
      requests,
      error,
      artifacts: {
        log: "script.log",
      },
    };

    writeJson(summaryPath, summary);
    writeText(reportPath, renderScenarioHtml(summary));
  };

  return {
    request,
    finalize,
  };
}
