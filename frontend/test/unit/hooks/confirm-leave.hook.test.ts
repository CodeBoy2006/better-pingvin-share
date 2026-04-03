import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import useConfirmLeave from "../../../src/hooks/confirm-leave.hook";
import { setMockRouter } from "../../router";

describe("confirm-leave.hook", () => {
  it("registers and unregisters router and unload listeners when enabled", () => {
    const router = setMockRouter();
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() =>
      useConfirmLeave({
        message: "Leave this page?",
        enabled: true,
      }),
    );

    expect(router.events.on).toHaveBeenCalledWith(
      "routeChangeStart",
      expect.any(Function),
    );
    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );

    unmount();

    expect(router.events.off).toHaveBeenCalledWith(
      "routeChangeStart",
      expect.any(Function),
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    );
  });

  it("aborts route changes when the user cancels the confirmation dialog", () => {
    const router = setMockRouter();
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderHook(() =>
      useConfirmLeave({
        message: "Leave this page?",
        enabled: true,
      }),
    );

    let thrownError: unknown;

    try {
      router.events.emit("routeChangeStart", "/next");
    } catch (error) {
      thrownError = error;
    }

    expect(window.confirm).toHaveBeenCalledWith("Leave this page?");
    expect(router.events.emit).toHaveBeenCalledWith("routeChangeError");
    expect(thrownError).toBe("Route change aborted.");
  });

  it("wires the beforeunload handler when leaving the page is blocked", () => {
    setMockRouter();
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    renderHook(() =>
      useConfirmLeave({
        message: "Leave this page?",
        enabled: true,
      }),
    );

    const beforeUnloadHandler = addEventListenerSpy.mock.calls.find(
      ([eventName]) => eventName === "beforeunload",
    )?.[1] as (event: BeforeUnloadEvent) => string;
    const event = {
      preventDefault: vi.fn(),
      returnValue: undefined,
    } as unknown as BeforeUnloadEvent;

    expect(beforeUnloadHandler(event)).toBe("Leave this page?");
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.returnValue).toBe("Leave this page?");
  });

  it("does not register listeners when the hook is disabled", () => {
    const router = setMockRouter();
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    renderHook(() =>
      useConfirmLeave({
        message: "Leave this page?",
        enabled: false,
      }),
    );

    expect(router.events.on).not.toHaveBeenCalled();
    expect(addEventListenerSpy).not.toHaveBeenCalled();
  });
});
