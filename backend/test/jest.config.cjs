const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");

const sharedConfig = {
  rootDir: backendRoot,
  moduleFileExtensions: ["js", "json", "ts"],
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testEnvironment: "node",
  transform: {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        isolatedModules: true,
        tsconfig: "<rootDir>/test/tsconfig.json",
      },
    ],
  },
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: ["<rootDir>/test/setup/load-env.cjs"],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.dto.ts",
    "!src/**/*.module.ts",
    "!src/main.ts",
  ],
  coverageDirectory: "<rootDir>/../test-results/backend/coverage",
  coverageReporters: ["text", "json-summary", "lcov"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};

module.exports = {
  projects: [
    {
      ...sharedConfig,
      displayName: "unit",
      testMatch: ["<rootDir>/test/unit/**/*.spec.ts"],
    },
    {
      ...sharedConfig,
      displayName: "integration",
      testMatch: ["<rootDir>/test/integration/**/*.spec.ts"],
    },
  ],
};
