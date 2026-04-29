import axios from "axios";
import Config, { AdminConfig, UpdateConfig } from "../types/config.type";
import api from "./api.service";
import { stringToTimespan } from "../utils/date.util";

const fallbackConfigVariables: Config[] = [
  {
    key: "share.maxExpiration",
    defaultValue: "0 days",
    value: "0 days",
    type: "timespan",
  },
  {
    key: "share.defaultExpiration",
    defaultValue: "7 days",
    value: "7 days",
    type: "timespan",
  },
];

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
    fallbackConfigVariables.filter((variable) => variable.key == key)[0];

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
