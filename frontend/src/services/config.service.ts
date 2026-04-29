import axios from "axios";
import Config, { AdminConfig, UpdateConfig } from "../types/config.type";
import api from "./api.service";
import { stringToTimespan } from "../utils/date.util";

const fallbackConfigVariables: Config[] = [
  {
    key: "api.corsAllowedOrigins",
    defaultValue: "",
    value: "",
    type: "string",
  },
  {
    key: "email.enableShareEmailRecipients",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
  {
    key: "general.appName",
    defaultValue: "Better Pingvin Share",
    value: "Better Pingvin Share",
    type: "string",
  },
  {
    key: "general.appUrl",
    defaultValue: "http://localhost:3000",
    value: "http://localhost:3000",
    type: "string",
  },
  {
    key: "general.sessionDuration",
    defaultValue: "3 months",
    value: "3 months",
    type: "timespan",
  },
  {
    key: "general.showHomePage",
    defaultValue: "true",
    value: "true",
    type: "boolean",
  },
  {
    key: "ldap.enabled",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
  {
    key: "legal.enabled",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
  {
    key: "legal.imprintText",
    defaultValue: "",
    value: "",
    type: "text",
  },
  {
    key: "legal.imprintUrl",
    defaultValue: "",
    value: "",
    type: "string",
  },
  {
    key: "legal.privacyPolicyText",
    defaultValue: "",
    value: "",
    type: "text",
  },
  {
    key: "legal.privacyPolicyUrl",
    defaultValue: "",
    value: "",
    type: "string",
  },
  {
    key: "oauth.disablePassword",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
  {
    key: "share.allowAdminAccessAllShares",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
  {
    key: "share.allowRegistration",
    defaultValue: "true",
    value: "true",
    type: "boolean",
  },
  {
    key: "share.allowUnauthenticatedShares",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
  {
    key: "share.autoOpenShareModal",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
  {
    key: "share.chunkSize",
    defaultValue: "10000000",
    value: "10000000",
    type: "filesize",
  },
  {
    key: "share.defaultExpiration",
    defaultValue: "7 days",
    value: "7 days",
    type: "timespan",
  },
  {
    key: "share.expiredEditablePeriod",
    defaultValue: "0 days",
    value: "0 days",
    type: "timespan",
  },
  {
    key: "share.fileRetentionPeriod",
    defaultValue: "0 days",
    value: "0 days",
    type: "timespan",
  },
  {
    key: "share.filesJsonPasswordProtectedLinksIncludeToken",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
  {
    key: "share.filesJsonWebViewLinksEnabled",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
  {
    key: "share.maxExpiration",
    defaultValue: "0 days",
    value: "0 days",
    type: "timespan",
  },
  {
    key: "share.maxSize",
    defaultValue: "1000000000",
    value: "1000000000",
    type: "filesize",
  },
  {
    key: "share.shareIdLength",
    defaultValue: "8",
    value: "8",
    type: "number",
  },
  {
    key: "smtp.allowUnauthorizedCertificates",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
  {
    key: "smtp.enabled",
    defaultValue: "false",
    value: "false",
    type: "boolean",
  },
];

const fallbackConfigVariablesByKey = new Map(
  fallbackConfigVariables.map((variable) => [variable.key, variable]),
);

const list = async (): Promise<Config[]> => {
  return (await api.get("/configs")).data;
};

const getByCategory = async (category: string): Promise<AdminConfig[]> => {
  return (await api.get(`/configs/admin/${category}`)).data;
};

const updateMany = async (data: UpdateConfig[]): Promise<AdminConfig[]> => {
  return (await api.patch("/configs/admin", data)).data;
};

const get = (key: string, configVariables: Config[]): any => {
  if (!configVariables) return null;

  const configVariable =
    configVariables.filter((variable) => variable.key == key)[0] ??
    fallbackConfigVariablesByKey.get(key);

  if (!configVariable) throw new Error(`Config variable ${key} not found`);

  const value = configVariable.value ?? configVariable.defaultValue;

  if (configVariable.type == "number" || configVariable.type == "filesize")
    return parseInt(value);
  if (configVariable.type == "boolean") return value == "true";
  if (configVariable.type == "string" || configVariable.type == "text")
    return value;
  if (configVariable.type == "timespan") return stringToTimespan(value);
};

const finishSetup = async (): Promise<AdminConfig[]> => {
  return (await api.post("/configs/admin/finishSetup")).data;
};

const sendTestEmail = async (email: string) => {
  await api.post("/configs/admin/testEmail", { email });
};

const isNewReleaseAvailable = async () => {
  const response = (
    await axios.get(
      "https://api.github.com/repos/CodeBoy2006/better-pingvin-share/releases/latest",
    )
  ).data;
  return response.tag_name.replace("v", "") != process.env.VERSION;
};

const changeLogo = async (file: File) => {
  const form = new FormData();
  form.append("file", file);

  await api.post("/configs/admin/logo", form);
};
export default {
  list,
  getByCategory,
  updateMany,
  get,
  finishSetup,
  sendTestEmail,
  isNewReleaseAvailable,
  changeLogo,
};
