import React from "react";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { fetchMock, installFetchMock } from "./network";
import { getMockRouter, resetMockRouter } from "./router";

vi.mock("next/head", () => ({
  default: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string | { pathname?: string };
  }) =>
    React.createElement(
      "a",
      { href: typeof href === "string" ? href : href.pathname, ...props },
      children,
    ),
}));

vi.mock("next/router", async () => {
  const actual = await vi.importActual<typeof import("next/router")>(
    "next/router",
  );

  return {
    ...actual,
    useRouter: () => getMockRouter(),
  };
});

installFetchMock();

const installDomMocks = () => {
  const matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMedia,
  });

  Object.defineProperty(globalThis, "matchMedia", {
    configurable: true,
    writable: true,
    value: matchMedia,
  });

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
    },
  });

  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
};

installDomMocks();

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  resetMockRouter();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  installDomMocks();
});

class ResizeObserverMock {
  disconnect() {}

  observe() {}

  unobserve() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock;
}
