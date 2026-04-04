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

export const MAX_FILE_WEB_VIEW_BYTES = 5 * 1024 * 1024;

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
  c: "c",
  cc: "cpp",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  diff: "diff",
  dockerfile: "docker",
  env: "bash",
  go: "go",
  h: "c",
  hpp: "cpp",
  htm: "html",
  html: "html",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  log: "text",
  lua: "lua",
  m: "matlab",
  makefile: "makefile",
  php: "php",
  pl: "perl",
  properties: "properties",
  py: "python",
  r: "r",
  rb: "ruby",
  rs: "rust",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svelte: "svelte",
  swift: "swift",
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

const VIDEO_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
};

const LOOKS_TEXTUAL_MIME_TYPES = [
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/x-httpd-php",
  "application/x-sh",
  "application/yaml",
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

export function getFileWebViewDescriptor(
  fileName: string,
  contentType?: string | false,
) {
  const extension = getExtension(fileName);
  const normalizedContentType =
    normalizeContentType(contentType) ||
    (mime.lookup(fileName) || "").toString().split(";")[0];

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
    normalizedContentType.startsWith("text/") ||
    LOOKS_TEXTUAL_MIME_TYPES.includes(normalizedContentType)
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

  if (
    descriptor.kind === "image" ||
    descriptor.kind === "audio" ||
    descriptor.kind === "video" ||
    descriptor.kind === "pdf"
  ) {
    return true;
  }

  return numericSize <= MAX_FILE_WEB_VIEW_BYTES;
}
