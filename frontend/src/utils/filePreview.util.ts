import mime from "mime-types";

export type FilePreviewKind =
  | "markdown"
  | "code"
  | "text"
  | "image"
  | "audio"
  | "video"
  | "pdf"
  | "unsupported";

export type FilePreviewDescriptor = {
  kind: FilePreviewKind;
  language?: string;
  mimeType?: string;
};

export const MAX_TEXT_PREVIEW_BYTES = 5 * 1024 * 1024;
export const MAX_SNIFFABLE_PREVIEW_BYTES = 10 * 1024 * 1024;

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
  htm: "markup",
  html: "markup",
  ini: "ini",
  java: "java",
  js: "javascript",
  json: "json",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  log: "log",
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
  vue: "jsx",
  xml: "markup",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

const LOOKS_TEXTUAL_MIME_TYPES = [
  "application/json",
  "application/ld+json",
  "application/xml",
  "application/x-httpd-php",
  "application/x-sh",
  "application/yaml",
];

const getExtension = (fileName: string) => {
  const lowerCasedFileName = fileName.toLowerCase();

  if (lowerCasedFileName === "dockerfile") {
    return "dockerfile";
  }

  if (lowerCasedFileName === "makefile") {
    return "makefile";
  }

  return lowerCasedFileName.split(".").pop() || "";
};

export const getPreviewMimeType = (fileName: string) => {
  return (mime.lookup(fileName) || "").toString();
};

export const guessFilePreviewDescriptor = (
  fileName: string,
): FilePreviewDescriptor => {
  const extension = getExtension(fileName);
  const mimeType = getPreviewMimeType(fileName);

  if (MARKDOWN_EXTENSIONS.has(extension)) {
    return { kind: "markdown", mimeType: "text/markdown" };
  }

  if (CODE_LANGUAGE_BY_EXTENSION[extension]) {
    return {
      kind: extension === "txt" || extension === "log" ? "text" : "code",
      language: CODE_LANGUAGE_BY_EXTENSION[extension],
      mimeType,
    };
  }

  if (mimeType === "application/pdf") {
    return { kind: "pdf", mimeType };
  }

  if (mimeType.startsWith("image/")) {
    return { kind: "image", mimeType };
  }

  if (mimeType.startsWith("audio/")) {
    return { kind: "audio", mimeType };
  }

  if (mimeType.startsWith("video/")) {
    return { kind: "video", mimeType };
  }

  if (
    mimeType.startsWith("text/") ||
    LOOKS_TEXTUAL_MIME_TYPES.includes(mimeType)
  ) {
    return { kind: "text", mimeType };
  }

  return { kind: "unsupported", mimeType: mimeType || undefined };
};

export const canPreviewFileByName = (fileName: string, sizeBytes: number) => {
  const descriptor = guessFilePreviewDescriptor(fileName);

  if (["image", "audio", "video", "pdf"].includes(descriptor.kind)) {
    return true;
  }

  if (["markdown", "code", "text"].includes(descriptor.kind)) {
    return sizeBytes <= MAX_TEXT_PREVIEW_BYTES;
  }

  return sizeBytes <= MAX_SNIFFABLE_PREVIEW_BYTES;
};

export const sniffBinaryPreviewDescriptor = (
  bytes: Uint8Array,
): FilePreviewDescriptor | undefined => {
  if (bytes.length >= 4) {
    if (
      bytes[0] === 0x25 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x44 &&
      bytes[3] === 0x46
    ) {
      return { kind: "pdf", mimeType: "application/pdf" };
    }

    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return { kind: "image", mimeType: "image/png" };
    }

    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return { kind: "image", mimeType: "image/jpeg" };
    }

    if (
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x38
    ) {
      return { kind: "image", mimeType: "image/gif" };
    }

    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes.length >= 12 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return { kind: "image", mimeType: "image/webp" };
    }

    if (
      bytes[0] === 0x49 &&
      bytes[1] === 0x44 &&
      bytes[2] === 0x33
    ) {
      return { kind: "audio", mimeType: "audio/mpeg" };
    }

    if (
      bytes[0] === 0x4f &&
      bytes[1] === 0x67 &&
      bytes[2] === 0x67 &&
      bytes[3] === 0x53
    ) {
      return { kind: "audio", mimeType: "audio/ogg" };
    }

    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes.length >= 12 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x41 &&
      bytes[10] === 0x56 &&
      bytes[11] === 0x45
    ) {
      return { kind: "audio", mimeType: "audio/wav" };
    }

    if (
      bytes.length >= 12 &&
      bytes[4] === 0x66 &&
      bytes[5] === 0x74 &&
      bytes[6] === 0x79 &&
      bytes[7] === 0x70
    ) {
      return { kind: "video", mimeType: "video/mp4" };
    }

    if (
      bytes[0] === 0x1a &&
      bytes[1] === 0x45 &&
      bytes[2] === 0xdf &&
      bytes[3] === 0xa3
    ) {
      return { kind: "video", mimeType: "video/webm" };
    }
  }

  return undefined;
};

export const isProbablyText = (bytes: Uint8Array) => {
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
};

export const decodePreviewText = (bytes: Uint8Array) => {
  return new TextDecoder("utf-8").decode(bytes);
};

const detectLanguageFromShebang = (text: string) => {
  const firstLine = text.split(/\r?\n/, 1)[0];

  if (!firstLine.startsWith("#!")) {
    return undefined;
  }

  if (firstLine.includes("python")) return "python";
  if (firstLine.includes("bash") || firstLine.includes("sh")) return "bash";
  if (firstLine.includes("node")) return "javascript";
  if (firstLine.includes("ruby")) return "ruby";
  if (firstLine.includes("php")) return "php";

  return undefined;
};

const looksLikeMarkdown = (text: string) => {
  const sample = text.slice(0, 4000);

  if (/^---\s*\n[\s\S]{0,1000}\n---\s*(\n|$)/.test(sample)) {
    return true;
  }

  const markdownSignals = [
    /^#{1,6}\s/m,
    /^\s*[-*+]\s/m,
    /^\s*\d+\.\s/m,
    /```/,
    /\[[^\]]+\]\([^)]+\)/,
    /\$\$[\s\S]*\$\$/,
    /(^|\s)\$[^$\n]+\$(\s|$)/,
    /^\|.+\|\s*$/m,
  ];

  return markdownSignals.some((signal) => signal.test(sample));
};

export const detectTextPreviewDescriptor = (
  fileName: string,
  text: string,
): FilePreviewDescriptor => {
  const guessedDescriptor = guessFilePreviewDescriptor(fileName);
  const shebangLanguage = detectLanguageFromShebang(text);

  if (guessedDescriptor.kind === "markdown") {
    return guessedDescriptor;
  }

  if (guessedDescriptor.kind === "code") {
    return {
      kind: "code",
      language: guessedDescriptor.language || shebangLanguage || "text",
      mimeType: guessedDescriptor.mimeType,
    };
  }

  if (shebangLanguage) {
    return { kind: "code", language: shebangLanguage };
  }

  if (looksLikeMarkdown(text)) {
    return { kind: "markdown", mimeType: "text/markdown" };
  }

  return guessedDescriptor.kind === "unsupported"
    ? { kind: "text", mimeType: guessedDescriptor.mimeType }
    : guessedDescriptor;
};
