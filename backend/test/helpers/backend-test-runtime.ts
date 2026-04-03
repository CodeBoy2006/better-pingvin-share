import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface BackendTestRuntime {
  rootDir: string;
  dataDir: string;
  shareDir: string;
  databaseFilePath: string;
  databaseUrl: string;
  cleanup: () => void;
}

export const toSqliteDatabaseUrl = (databaseFilePath: string) =>
  `file:${databaseFilePath}?connection_limit=1`;

export const createBackendTestRuntime = (
  prefix = "better-pingvin-share-",
): BackendTestRuntime => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dataDir = path.join(rootDir, "data");
  const shareDir = path.join(dataDir, "uploads", "shares");
  const databaseFilePath = path.join(dataDir, "pingvin-share.db");

  fs.mkdirSync(shareDir, { recursive: true });
  fs.closeSync(fs.openSync(databaseFilePath, "a"));

  return {
    rootDir,
    dataDir,
    shareDir,
    databaseFilePath,
    databaseUrl: toSqliteDatabaseUrl(databaseFilePath),
    cleanup: () => {
      fs.rmSync(rootDir, { force: true, recursive: true });
    },
  };
};
