import { ApiToken, CreateApiToken, CreatedApiToken } from "../types/apiToken.type";
import api from "./api.service";

const list = async (): Promise<ApiToken[]> => {
  return (await api.get("/v1/tokens")).data;
};

const create = async (token: CreateApiToken): Promise<CreatedApiToken> => {
  return (await api.post("/v1/tokens", token)).data;
};

const remove = async (id: string) => {
  await api.delete(`/v1/tokens/${id}`);
};

export default {
  list,
  create,
  remove,
};
