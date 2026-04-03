import type { Config } from "@prisma/client";
import {
  getDefinedConfigVariable,
  getDefinedConfigVariables,
} from "src/config/configDefinitions";

const fixedUpdatedAt = new Date("2024-01-01T00:00:00.000Z");

type ConfigOverrideMap = Record<string, string | null | undefined>;

export const defaultConfigMockValues: Record<string, unknown> = {
  "general.appName": "Better Pingvin Share",
  "general.appUrl": "http://localhost:3000",
  "general.secureCookies": false,
  "general.sessionDuration": { value: 3, unit: "months" },
  "internal.jwtSecret": "test-jwt-secret",
  "ldap.enabled": false,
  "ldap.adminGroups": "admins",
  "ldap.fieldNameEmail": "userPrincipalName",
  "ldap.fieldNameMemberOf": "memberOf",
  "oauth.disablePassword": false,
  "oauth.ignoreTotp": true,
  "share.allowRegistration": true,
  "share.allowUnauthenticatedShares": false,
  "share.chunkSize": 1024,
  "share.maxExpiration": { value: 30, unit: "days" },
  "share.maxSize": 1000000,
  "share.zipCompressionLevel": 9,
  "smtp.enabled": false,
};

export const buildConfigEntries = (
  overrides: ConfigOverrideMap = {},
): Config[] =>
  getDefinedConfigVariables().map((definition) => {
    const key = `${definition.category}.${definition.name}`;
    const value =
      key in overrides
        ? overrides[key]
        : (definition.properties.value?.toString() ?? null);

    return {
      updatedAt: fixedUpdatedAt,
      category: definition.category,
      name: definition.name,
      type: definition.properties.type,
      defaultValue: definition.properties.defaultValue ?? "",
      value,
      obscured: definition.properties.obscured ?? false,
      secret: definition.properties.secret ?? true,
      locked: definition.properties.locked ?? false,
      order: definition.order,
    };
  });

export const findConfigEntry = (
  configs: Config[],
  key: `${string}.${string}`,
): Config => {
  const config = configs.find(
    (entry) => `${entry.category}.${entry.name}` === key,
  );

  if (!config) {
    throw new Error(`Missing config fixture for ${key}`);
  }

  return config;
};

export const buildConfigUpdate = (
  key: string,
  value: string | number | boolean,
) => ({
  key,
  value,
});

export const buildConfigEntry = (
  key: `${string}.${string}`,
  value?: string | null,
): Config => {
  return findConfigEntry(buildConfigEntries({ [key]: value }), key);
};
