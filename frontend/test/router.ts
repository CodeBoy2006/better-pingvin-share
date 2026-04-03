import type { NextRouter } from "next/router";
import { vi } from "vitest";

type RouterEventHandler = (...args: any[]) => void;
type RouterEvents = NextRouter["events"];

export type MockRouterOverrides = Partial<NextRouter>;

const createRouterEvents = (): RouterEvents => {
  const handlers = new Map<string, Set<RouterEventHandler>>();

  return {
    on: vi.fn((event: string, handler: RouterEventHandler) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler));
    }),
    off: vi.fn((event: string, handler: RouterEventHandler) => {
      handlers.get(event)?.delete(handler);
    }),
    emit: vi.fn((event: string, ...args: any[]) => {
      handlers.get(event)?.forEach((handler) => handler(...args));
    }),
  };
};

export const createMockRouter = (
  overrides: MockRouterOverrides = {},
): NextRouter => {
  return {
    basePath: "",
    pathname: "/",
    route: "/",
    query: {},
    asPath: "/",
    push: vi.fn().mockResolvedValue(true),
    replace: vi.fn().mockResolvedValue(true),
    reload: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
    beforePopState: vi.fn(),
    events: createRouterEvents(),
    isFallback: false,
    isReady: true,
    isLocaleDomain: false,
    isPreview: false,
    defaultLocale: "en-US",
    locale: "en-US",
    locales: ["en-US"],
    ...overrides,
  };
};

let mockRouter = createMockRouter();

export const getMockRouter = () => mockRouter;

export const setMockRouter = (overrides: MockRouterOverrides = {}) => {
  mockRouter = createMockRouter(overrides);
  return mockRouter;
};

export const resetMockRouter = () => {
  mockRouter = createMockRouter();
  return mockRouter;
};
