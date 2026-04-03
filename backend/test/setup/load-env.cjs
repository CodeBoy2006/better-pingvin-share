const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const envPath = path.resolve(__dirname, "../../../.env.test");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

process.env.NODE_ENV ||= "test";
process.env.TZ ||= "UTC";

if (!process.env.DATA_DIRECTORY) {
  process.env.DATA_DIRECTORY = path.resolve(__dirname, "../../tmp/test-data");
}

fs.mkdirSync(process.env.DATA_DIRECTORY, { recursive: true });

if (!process.env.DATABASE_URL) {
  const databaseFilePath = path.resolve(
    process.env.DATA_DIRECTORY,
    "pingvin-share.db",
  );

  fs.closeSync(fs.openSync(databaseFilePath, "a"));
  process.env.DATABASE_URL = `file:${databaseFilePath}?connection_limit=1`;
}
