import * as mime from "mime-types";

export type FileWebViewKind =
  | "markdown"
  | "code"
  | "text"
  | "image"
  | "audio"
  | "video"
  | "pdf";

export type FileWebViewDescriptor = {
  kind: FileWebViewKind;
  contentType?: string;
  language?: string;
};

export const FILE_WEB_VIEW_SNIFF_BYTES = 8 * 1024;

const MARKDOWN_EXTENSIONS = new Set([
  "md",
  "markdown",
  "mdown",
  "mkd",
  "mkdn",
  "mdx",
  "qmd",
]);

const CODE_LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bat: "batch",
  c: "c",
  cjs: "javascript",
  cc: "cpp",
  clj: "clojure",
  cmake: "cmake",
  cpp: "cpp",
  cts: "typescript",
  cmd: "batch",
  cs: "csharp",
  css: "css",
  diff: "diff",
  dockerfile: "docker",
  env: "bash",
  gql: "graphql",
  go: "go",
  graphql: "graphql",
  gradle: "groovy",
  groovy: "groovy",
  h: "c",
  hcl: "hcl",
  hpp: "cpp",
  htm: "html",
  html: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  json5: "json",
  jsonc: "json",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  log: "text",
  lua: "lua",
  m: "matlab",
  makefile: "makefile",
  mjs: "javascript",
  mts: "typescript",
  nix: "nix",
  php: "php",
  pl: "perl",
  proto: "protobuf",
  properties: "properties",
  ps1: "powershell",
  psd1: "powershell",
  psm1: "powershell",
  py: "python",
  r: "r",
  rb: "ruby",
  scala: "scala",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svelte: "svelte",
  swift: "swift",
  tf: "hcl",
  tfvars: "hcl",
  toml: "toml",
  ts: "typescript",
  tsx: "tsx",
  txt: "text",
  vue: "vue",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

const TEXT_EXTENSIONS = new Set([
  "adoc",
  "asc",
  "cfg",
  "conf",
  "csv",
  "dockerignore",
  "editorconfig",
  "eslintrc",
  "gitattributes",
  "gitignore",
  "jsonl",
  "latex",
  "ndjson",
  "npmrc",
  "plist",
  "prettierrc",
  "rst",
  "tex",
  "tool-versions",
  "tsv",
]);

const TEXTUAL_FILE_NAME_PREFIXES = [".env."];

const VIDEO_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
};

const LOOKS_TEXTUAL_MIME_TYPES = [
  "application/json",
  "application/json5",
  "application/ld+json",
  "application/toml",
  "application/xml",
  "application/x-httpd-php",
  "application/x-sh",
  "application/yaml",
  "text/yaml",
];

function getExtension(fileName: string) {
  const lowerCasedFileName = fileName.toLowerCase();

  if (lowerCasedFileName === "dockerfile") {
    return "dockerfile";
  }

  if (lowerCasedFileName === "makefile") {
    return "makefile";
  }

  return lowerCasedFileName.split(".").pop() || "";
}

function normalizeContentType(contentType?: string | false) {
  if (typeof contentType === "string" && contentType.length > 0) {
    return contentType.split(";")[0];
  }

  return (mime.lookup(contentType || "") || "").toString();
}

function isTextualMimeType(contentType: string) {
  return (
    contentType.startsWith("text/") ||
    LOOKS_TEXTUAL_MIME_TYPES.includes(contentType) ||
    contentType.endsWith("+json") ||
    contentType.endsWith("+xml") ||
    contentType.endsWith("+yaml")
  );
}

function getSpecialFileDescriptor(
  lowerCasedFileName: string,
): FileWebViewDescriptor | undefined {
  if (
    TEXTUAL_FILE_NAME_PREFIXES.some((prefix) =>
      lowerCasedFileName.startsWith(prefix),
    )
  ) {
    return {
      kind: "text",
      contentType: "text/plain",
    } satisfies FileWebViewDescriptor;
  }

  return undefined;
}

export function getFileWebViewDescriptor(
  fileName: string,
  contentType?: string | false,
) {
  const lowerCasedFileName = fileName.toLowerCase();
  const extension = getExtension(fileName);
  const normalizedContentType =
    normalizeContentType(contentType) ||
    (mime.lookup(fileName) || "").toString().split(";")[0];

  const specialFileDescriptor = getSpecialFileDescriptor(lowerCasedFileName);

  if (specialFileDescriptor) {
    return specialFileDescriptor;
  }

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return {
      kind: "markdown",
      contentType: "text/markdown",
      language: "markdown",
    } satisfies FileWebViewDescriptor;
  }

  const language = CODE_LANGUAGE_BY_EXTENSION[extension];

  if (language) {
    return {
      kind: language === "text" ? "text" : "code",
      contentType: normalizedContentType || undefined,
      language: language === "text" ? undefined : language,
    } satisfies FileWebViewDescriptor;
  }

  if (
    TEXT_EXTENSIONS.has(extension) ||
    isTextualMimeType(normalizedContentType)
  ) {
    return {
      kind: "text",
      contentType: normalizedContentType || undefined,
    } satisfies FileWebViewDescriptor;
  }

  if (normalizedContentType.startsWith("image/")) {
    return {
      kind: "image",
      contentType: normalizedContentType,
    } satisfies FileWebViewDescriptor;
  }

  if (normalizedContentType.startsWith("audio/")) {
    return {
      kind: "audio",
      contentType: normalizedContentType,
    } satisfies FileWebViewDescriptor;
  }

  if (VIDEO_CONTENT_TYPE_BY_EXTENSION[extension]) {
    return {
      kind: "video",
      contentType: VIDEO_CONTENT_TYPE_BY_EXTENSION[extension],
    } satisfies FileWebViewDescriptor;
  }

  if (normalizedContentType.startsWith("video/")) {
    return {
      kind: "video",
      contentType: normalizedContentType,
    } satisfies FileWebViewDescriptor;
  }

  if (normalizedContentType === "application/mp4") {
    return {
      kind: "video",
      contentType: "video/mp4",
    } satisfies FileWebViewDescriptor;
  }

  if (normalizedContentType === "application/pdf") {
    return {
      kind: "pdf",
      contentType: normalizedContentType,
    } satisfies FileWebViewDescriptor;
  }

  return undefined;
}

export function isProbablyText(bytes: Uint8Array) {
  const sample = bytes.slice(0, Math.min(bytes.length, 2048));

  if (sample.length === 0) {
    return true;
  }

  let suspiciousByteCount = 0;

  for (let index = 0; index < sample.length; index++) {
    const byte = sample[index];

    if (byte === 0) {
      return false;
    }

    const isAllowedControlCharacter =
      byte === 9 || byte === 10 || byte === 13 || byte === 12;
    const isPrintableAscii = byte >= 32 && byte <= 126;
    const isExtendedByte = byte >= 128;

    if (!isAllowedControlCharacter && !isPrintableAscii && !isExtendedByte) {
      suspiciousByteCount++;
    }
  }

  return suspiciousByteCount / sample.length < 0.1;
}

export function getFileWebViewDescriptorFromSample(bytes: Uint8Array) {
  if (!isProbablyText(bytes)) {
    return undefined;
  }

  return {
    kind: "text",
    contentType: "text/plain",
  } satisfies FileWebViewDescriptor;
}

export function canExposeFileWebView(
  fileName: string,
  sizeBytes: string | number,
  contentType?: string | false,
) {
  const descriptor = getFileWebViewDescriptor(fileName, contentType);

  if (!descriptor) {
    return false;
  }

  const numericSize =
    typeof sizeBytes === "string" ? parseInt(sizeBytes, 10) : sizeBytes;

  if (!Number.isFinite(numericSize)) {
    return false;
  }

  return true;
}
