import React from "react";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { getMockRouter, setMockRouter } from "./router";

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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  setMockRouter();
  installDomMocks();
});

const installDomMocks = () => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  if (!navigator.clipboard) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  }

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
};

installDomMocks();

class ResizeObserverMock {
  disconnect() {}

  observe() {}

  unobserve() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock;
}
