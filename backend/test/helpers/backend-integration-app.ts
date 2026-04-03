import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as argon from "argon2";
import type { User } from "@prisma/client";
import cookieParser from "cookie-parser";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { buildAuthUser } from "../fixtures/auth.fixture";
import {
  BackendTestRuntime,
  createBackendTestRuntime,
} from "./backend-test-runtime";

type MockedEmailService = {
  sendInviteEmail: jest.Mock;
  sendMailToReverseShareCreator: jest.Mock;
  sendMailToShareRecipients: jest.Mock;
  sendResetPasswordEmail: jest.Mock;
  sendTestMail: jest.Mock;
};

type CreateUserOptions = Partial<User> & {
  plainPassword?: string | null;
};

export interface BackendIntegrationApp {
  app: NestExpressApplication;
  authService: any;
  clearData: () => Promise<void>;
  close: () => Promise<void>;
  configService: any;
  createUser: (
    options?: CreateUserOptions,
  ) => Promise<{ plainPassword: string | null; user: User }>;
  emailService: MockedEmailService;
  issueAuthCookies: (
    user: User,
    options?: {
      includeAccessToken?: boolean;
      includeRefreshToken?: boolean;
    },
  ) => Promise<string[]>;
  prisma: any;
  runtime: BackendTestRuntime;
  setConfig: (key: string, value: string | number | boolean) => Promise<void>;
}

const backendRoot = path.resolve(__dirname, "../..");
const prismaSchemaPath = path.join(backendRoot, "prisma", "schema.prisma");
const envKeys = [
  "CONFIG_FILE",
  "DATABASE_URL",
  "DATA_DIRECTORY",
  "NODE_ENV",
  "TZ",
] as const;

const createEmailServiceMock = (): MockedEmailService => ({
  sendInviteEmail: jest.fn(),
  sendMailToReverseShareCreator: jest.fn(),
  sendMailToShareRecipients: jest.fn(),
  sendResetPasswordEmail: jest.fn(),
  sendTestMail: jest.fn(),
});

const runPrismaDbPush = (env: NodeJS.ProcessEnv) => {
  execFileSync(
    "npx",
    ["prisma", "db", "push", "--skip-generate", "--schema", prismaSchemaPath],
    {
      cwd: backendRoot,
      env,
      stdio: "pipe",
    },
  );
};

const restoreEnv = (previousEnv: Record<(typeof envKeys)[number], string>) => {
  for (const key of envKeys) {
    const previousValue = previousEnv[key];

    if (previousValue === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = previousValue;
  }
};

export const createBackendIntegrationApp =
  async (): Promise<BackendIntegrationApp> => {
    const runtime = createBackendTestRuntime("batch-b-integration-");
    const previousEnv = Object.fromEntries(
      envKeys.map((key) => [key, process.env[key]]),
    ) as Record<(typeof envKeys)[number], string>;

    fs.mkdirSync(path.join(runtime.dataDir, "uploads", "_temp"), {
      recursive: true,
    });

    process.env.NODE_ENV = "test";
    process.env.TZ = "UTC";
    process.env.DATA_DIRECTORY = runtime.dataDir;
    process.env.DATABASE_URL = runtime.databaseUrl;
    process.env.CONFIG_FILE = path.join(runtime.rootDir, "config.yaml");

    runPrismaDbPush(process.env);
    jest.resetModules();

    const [
      { ClassSerializerInterceptor, Module, ValidationPipe },
      { NestFactory, Reflector },
      { AppCacheModule },
      { AuthService },
      { AuthModule },
      { ConfigService },
      { ConfigModule },
      { EmailService },
      { PrismaService },
      { PrismaModule },
      { ReverseShareModule },
      { UserModule },
    ] = await Promise.all([
      import("@nestjs/common"),
      import("@nestjs/core"),
      import("src/cache/cache.module"),
      import("src/auth/auth.service"),
      import("src/auth/auth.module"),
      import("src/config/config.service"),
      import("src/config/config.module"),
      import("src/email/email.service"),
      import("src/prisma/prisma.service"),
      import("src/prisma/prisma.module"),
      import("src/reverseShare/reverseShare.module"),
      import("src/user/user.module"),
    ]);

    const emailService = createEmailServiceMock();

    class BatchBIntegrationTestModule {}
    Module({
      imports: [
        PrismaModule,
        ConfigModule,
        AppCacheModule,
        AuthModule,
        UserModule,
        ReverseShareModule,
      ],
    })(BatchBIntegrationTestModule);

    try {
      const app = await NestFactory.create<NestExpressApplication>(
        BatchBIntegrationTestModule,
        {
          abortOnError: false,
          logger: false,
        },
      );

      Object.assign(app.get(EmailService), emailService);

      app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
      app.useGlobalInterceptors(
        new ClassSerializerInterceptor(app.get(Reflector)),
      );
      app.use(cookieParser());
      app.setGlobalPrefix("api");
      await app.init();

      const prisma = app.get(PrismaService);
      const configService = app.get(ConfigService);
      const authService = app.get(AuthService);

      const clearData = async () => {
        await prisma.file.deleteMany();
        await prisma.shareRecipient.deleteMany();
        await prisma.shareSecurity.deleteMany();
        await prisma.share.deleteMany();
        await prisma.reverseShare.deleteMany();
        await prisma.apiToken.deleteMany();
        await prisma.refreshToken.deleteMany();
        await prisma.loginToken.deleteMany();
        await prisma.resetPasswordToken.deleteMany();
        await prisma.oAuthUser.deleteMany();
        await prisma.user.deleteMany();
      };

      const createUser = async (
        options: CreateUserOptions = {},
      ): Promise<{ plainPassword: string | null; user: User }> => {
        const baseUser = buildAuthUser(options);
        const plainPassword =
          options.plainPassword === undefined
            ? "Password123!"
            : options.plainPassword;
        const password =
          options.password !== undefined
            ? options.password
            : plainPassword
              ? await argon.hash(plainPassword)
              : null;

        const user = await prisma.user.create({
          data: {
            username: baseUser.username,
            email: baseUser.email,
            password,
            isAdmin: baseUser.isAdmin,
            ldapDN: baseUser.ldapDN,
            totpEnabled: baseUser.totpEnabled,
            totpVerified: baseUser.totpVerified,
            totpSecret: baseUser.totpSecret,
          },
        });

        return {
          plainPassword,
          user,
        };
      };

      const issueAuthCookies = async (
        user: User,
        options: {
          includeAccessToken?: boolean;
          includeRefreshToken?: boolean;
        } = {},
      ) => {
        const includeAccessToken = options.includeAccessToken ?? true;
        const includeRefreshToken = options.includeRefreshToken ?? true;
        const cookies: string[] = [];
        let refreshTokenId = "integration-refresh-token";

        if (includeRefreshToken) {
          const refreshTokenResult = await authService.createRefreshToken(
            user.id,
          );
          refreshTokenId = refreshTokenResult.refreshTokenId;
          cookies.push(`refresh_token=${refreshTokenResult.refreshToken}`);
        }

        if (includeAccessToken) {
          const accessToken = await authService.createAccessToken(
            user,
            refreshTokenId,
          );
          cookies.push(`access_token=${accessToken}`);
        }

        return cookies;
      };

      const close = async () => {
        await app.close();
        await prisma.$disconnect();
        restoreEnv(previousEnv);
        runtime.cleanup();
        jest.resetModules();
      };

      return {
        app,
        authService,
        clearData,
        close,
        configService,
        createUser,
        emailService,
        issueAuthCookies,
        prisma,
        runtime,
        setConfig: async (key, value) => {
          await configService.update(key, value);
        },
      };
    } catch (error) {
      restoreEnv(previousEnv);
      runtime.cleanup();
      throw error;
    }
  };
