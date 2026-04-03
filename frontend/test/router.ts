import type { NextRouter } from "next/router";
import { vi } from "vitest";

const createRouterEvents = () => ({
  emit: vi.fn(),
  off: vi.fn(),
  on: vi.fn(),
});

export const createMockRouter = (
  overrides: Partial<NextRouter> = {},
): NextRouter => ({
  basePath: "",
  pathname: "/",
  route: "/",
  query: {},
  asPath: "/",
  back: vi.fn(),
  beforePopState: vi.fn(),
  events: createRouterEvents(),
  forward: vi.fn(),
  isFallback: false,
  isLocaleDomain: false,
  isPreview: false,
  isReady: true,
  prefetch: vi.fn().mockResolvedValue(undefined),
  push: vi.fn(),
  reload: vi.fn(),
  replace: vi.fn(),
  defaultLocale: "en",
  domainLocales: undefined,
  locale: "en",
  locales: ["en"],
  ...overrides,
});

let mockRouter = createMockRouter();

export const getMockRouter = () => mockRouter;

export const setMockRouter = (overrides: Partial<NextRouter> = {}) => {
  mockRouter = createMockRouter(overrides);
  return mockRouter;
};
