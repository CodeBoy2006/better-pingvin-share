import { describe, expect, it, vi } from "vitest";
import useConfig from "../../../src/hooks/config.hook";
import { renderHookWithProviders } from "../../render";

describe("config.hook", () => {
  it("reads typed config values from context and refreshes them", async () => {
    const configRefresh = vi.fn();
    const { result } = renderHookWithProviders(() => useConfig(), {
      providers: {
        configVariables: [
          {
            key: "share.allowRegistration",
            value: "true",
            defaultValue: "false",
            type: "boolean",
          },
        ],
        configRefresh,
      },
    });

    expect(result.current.get("share.allowRegistration")).toBe(true);

    await result.current.refresh();
    expect(configRefresh).toHaveBeenCalledTimes(1);
  });
});
