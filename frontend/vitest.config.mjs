import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(frontendRoot, "../.env.test") });

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    css: true,
    exclude: [...configDefaults.exclude, "**/.next/**"],
    setupFiles: ["./test/setup.ts"],
    restoreMocks: true,
    unstubEnvs: true,
    coverage: {
      provider: "v8",
      reportsDirectory: "../test-results/frontend/coverage",
      reporter: ["text", "json-summary", "lcov"],
      thresholds: {
        branches: 72,
        functions: 71,
        lines: 80,
        statements: 80,
      },
    },
    reporters: ["default", "json", "junit"],
    outputFile: {
      json: "../test-results/frontend/vitest.json",
      junit: "../test-results/frontend/junit.xml",
    },
  },
});
