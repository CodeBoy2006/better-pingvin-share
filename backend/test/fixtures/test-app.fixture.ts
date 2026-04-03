import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { jest } from "@jest/globals";
import { NestExpressApplication } from "@nestjs/platform-express";
import * as argon from "argon2";
import request from "supertest";
import {
  BackendTestRuntime,
  createBackendTestRuntime,
} from "../helpers/backend-test-runtime";

const backendRoot = path.resolve(__dirname, "..", "..");
const prismaBin = path.resolve(backendRoot, "node_modules", ".bin", "prisma");
const missingConfigFile = path.resolve(
  backendRoot,
  "tmp",
  "missing.test.config.yaml",
);

export type SeededUser = {
  user: {
    id: string;
    username: string;
    email: string;
    isAdmin: boolean;
    totpVerified: boolean;
    ldapDN: string | null;
    password: string | null;
  };
  password: string;
};

export type SessionFixture = SeededUser & {
  agent: ReturnType<typeof request.agent>;
};

export interface IntegrationAppFixture {
  app: NestExpressApplication;
  runtime: BackendTestRuntime;
  prisma: any;
  config: any;
  apiTokenService: any;
  request: ReturnType<typeof request>;
  createSession: (overrides?: Partial<{
    email: string;
    username: string;
    password: string;
    isAdmin: boolean;
    totpVerified: boolean;
    ldapDN: string | null;
  }>) => Promise<SessionFixture>;
  createShareDirectory: (shareId: string) => void;
  createApiToken: (input: {
    userId: string;
    name: string;
    scopes: string[];
    expiresAt?: string;
  }) => Promise<any>;
  createUser: (overrides?: Partial<{
    email: string;
    username: string;
    password: string;
    isAdmin: boolean;
    totpVerified: boolean;
    ldapDN: string | null;
  }>) => Promise<SeededUser>;
  updateConfig: (
    key: string,
    value: string | number | boolean,
  ) => Promise<any>;
  close: () => Promise<void>;
}

function resetDatabase(runtime: BackendTestRuntime) {
  execFileSync(
    prismaBin,
    ["db", "push", "--force-reset", "--skip-generate"],
    {
      cwd: backendRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        TZ: process.env.TZ || "UTC",
        CONFIG_FILE: missingConfigFile,
        DATA_DIRECTORY: runtime.dataDir,
        DATABASE_URL: runtime.databaseUrl,
        PRISMA_HIDE_UPDATE_MESSAGE: "1",
        NO_UPDATE_NOTIFIER: "1",
      },
      stdio: "pipe",
    },
  );
}

async function loadFreshAppModules() {
  jest.resetModules();

  const [{ AppModule }, { configureNestApplication }, prismaModule, configModule] =
    await Promise.all([
      import("src/app.module"),
      import("src/app.setup"),
      import("src/prisma/prisma.service"),
      import("src/config/config.service"),
    ]);
  const { NestFactory } = await import("@nestjs/core");

  const { ApiTokenService } = await import("src/apiToken/apiToken.service");

  return {
    AppModule,
    configureNestApplication,
    NestFactory,
    PrismaService: prismaModule.PrismaService,
    ConfigService: configModule.ConfigService,
    ApiTokenService,
  };
}

export async function createIntegrationApp(
  prefix = "better-pingvin-share-batch-c-",
): Promise<IntegrationAppFixture> {
  const runtime = createBackendTestRuntime(prefix);

  process.env.NODE_ENV = "test";
  process.env.TZ = process.env.TZ || "UTC";
  process.env.CONFIG_FILE = missingConfigFile;
  process.env.DATA_DIRECTORY = runtime.dataDir;
  process.env.DATABASE_URL = runtime.databaseUrl;

  resetDatabase(runtime);

  const {
    AppModule,
    configureNestApplication,
    NestFactory,
    PrismaService,
    ConfigService,
    ApiTokenService,
  } = await loadFreshAppModules();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    logger: false,
  });
  await configureNestApplication(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const config = app.get(ConfigService);
  const apiTokenService = app.get(ApiTokenService);

  const createShareDirectory = (shareId: string) => {
    fs.mkdirSync(path.join(runtime.shareDir, shareId), { recursive: true });
  };

  const createUser: IntegrationAppFixture["createUser"] = async (
    overrides = {},
  ) => {
    const password = overrides.password ?? "BatchCPassword123!";
    const username = overrides.username ?? `user-${randomUUID().slice(0, 8)}`;
    const email =
      overrides.email ??
      `${username.replace(/[^a-z0-9_-]/gi, "").toLowerCase()}@test.local`;

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: await argon.hash(password),
        isAdmin: overrides.isAdmin ?? false,
        totpVerified: overrides.totpVerified ?? false,
        ldapDN: overrides.ldapDN ?? null,
      },
    });

    return { user, password };
  };

  const createSession: IntegrationAppFixture["createSession"] = async (
    overrides = {},
  ) => {
    const seededUser = await createUser(overrides);
    const agent = request.agent(app.getHttpServer());
    const response = await agent.post("/api/auth/signIn").send({
      email: seededUser.user.email,
      password: seededUser.password,
    });

    if (response.status !== 200) {
      throw new Error(
        `Failed to create test session: ${response.status} ${response.text}`,
      );
    }

    return {
      ...seededUser,
      agent,
    };
  };

  return {
    app,
    runtime,
    prisma,
    config,
    apiTokenService,
    request: request(app.getHttpServer()),
    createUser,
    createSession,
    createShareDirectory,
    createApiToken: (input) => apiTokenService.createForUser(input),
    updateConfig: (key, value) => config.update(key, value),
    close: async () => {
      await Promise.allSettled([
        Promise.resolve(prisma?.$disconnect?.()),
        Promise.resolve(app.close()),
      ]);
      runtime.cleanup();
      jest.resetModules();
    },
  };
}
