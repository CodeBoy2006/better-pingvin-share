import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { fetchMock, installFetchMock } from "./network";
import { getMockRouter, resetMockRouter } from "./router";

vi.mock("next/router", () => ({
  useRouter: () => getMockRouter(),
}));

installFetchMock();

const installMatchMediaMock = () => {
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
};

installMatchMediaMock();

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  resetMockRouter();
  vi.restoreAllMocks();
  installMatchMediaMock();
  vi.unstubAllEnvs();
});

class ResizeObserverMock {
  disconnect() {}

  observe() {}

  unobserve() {}
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = ResizeObserverMock;
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}
