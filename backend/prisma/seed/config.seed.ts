import { PrismaClient } from "@prisma/client";

type SyncConfigVariables = (prisma: PrismaClient) => Promise<void>;

const loadSyncConfigVariables = (): SyncConfigVariables => {
  const modulePaths = [
    "../../src/config/configDefinitions",
    "../../dist/src/config/configDefinitions",
  ];

  for (const modulePath of modulePaths) {
    try {
      require.resolve(modulePath);
      return require(modulePath).syncConfigVariables as SyncConfigVariables;
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "MODULE_NOT_FOUND"
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    "Unable to load config definitions from source or compiled output.",
  );
};

const syncConfigVariables = loadSyncConfigVariables();

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        "file:../data/pingvin-share.db?connection_limit=1",
    },
  },
});

syncConfigVariables(prisma)
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
