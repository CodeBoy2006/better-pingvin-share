export function safeRedirectPath(path: string | undefined) {
  if (!path) return "/";

  const normalizedPath = path.trim();

  if (!normalizedPath || normalizedPath.startsWith("//")) {
    return "/";
  }

  if (!normalizedPath.startsWith("/")) return `/${normalizedPath}`;

  return normalizedPath;
}
