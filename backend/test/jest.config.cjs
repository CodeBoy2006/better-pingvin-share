const path = require("node:path");

const backendRoot = path.resolve(__dirname, "..");

const sharedConfig = {
  rootDir: backendRoot,
  moduleFileExtensions: ["js", "json", "ts"],
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testEnvironment: "node",
  testTimeout: 15_000,
  transform: {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/test/tsconfig.json",
      },
    ],
  },
  moduleNameMapper: {
    "^src/(.*)$": "<rootDir>/src/$1",
  },
  setupFiles: ["<rootDir>/test/setup/load-env.cjs"],
  setupFilesAfterEnv: ["<rootDir>/test/setup/compat.ts"],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};

module.exports = {
  rootDir: backendRoot,
  testTimeout: 30_000,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.dto.ts",
    "!src/**/*.module.ts",
    "!src/main.ts",
  ],
  coverageDirectory: "<rootDir>/test/coverage",
  coverageThreshold: {
    global: {
      branches: 59,
      functions: 65,
      lines: 72,
      statements: 72,
    },
  },
  coverageReporters: ["text", "json-summary", "lcov"],
  reporters: [
    "default",
    [
      "jest-junit",
      {
        outputDirectory: "../test-results/backend",
        outputName: "junit.xml",
      },
    ],
  ],
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
