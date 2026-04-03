import type { AxiosResponse } from "axios";
import { vi } from "vitest";

export const fetchMock = vi.fn();

export const installFetchMock = () => {
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    writable: true,
    value: fetchMock,
  });
};

export const mockFetchResponse = (body?: BodyInit | null, init?: ResponseInit) => {
  fetchMock.mockResolvedValue(new Response(body, init));
};

export const mockFetchJsonResponse = (
  payload: unknown,
  init?: ResponseInit,
) => {
  mockFetchResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
};

export const createAxiosResponse = <T>(
  data: T,
  overrides?: Partial<AxiosResponse<T>>,
) => {
  return {
    data,
    status: 200,
    statusText: "OK",
    headers: {},
    config: {},
    ...overrides,
  } as AxiosResponse<T>;
};
