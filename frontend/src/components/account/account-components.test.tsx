import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { renderWithProviders } from "../../../test/render";

const toggleColorScheme = vi.fn();

vi.mock("@mantine/core", async () => {
  const actual = await vi.importActual<typeof import("@mantine/core")>(
    "@mantine/core",
  );

  return {
    ...actual,
    useMantineColorScheme: () => ({
      toggleColorScheme,
    }),
  };
});

vi.mock("@mantine/hooks", async () => {
  const actual = await vi.importActual<typeof import("@mantine/hooks")>(
    "@mantine/hooks",
  );

  return {
    ...actual,
    useColorScheme: vi.fn(() => "dark"),
  };
});

vi.mock("cookies-next", () => ({
  getCookie: vi.fn(),
  setCookie: vi.fn(),
}));

vi.mock("../../utils/userPreferences.util", () => ({
  default: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

import { getCookie, setCookie } from "cookies-next";
import userPreferences from "../../utils/userPreferences.util";
import LanguagePicker from "./LanguagePicker";
import ThemeSwitcher from "./ThemeSwitcher";

describe("account components", () => {
  beforeEach(() => {
    toggleColorScheme.mockReset();
  });

  it("stores the selected language in a cookie and reloads the page", async () => {
    const user = userEvent.setup();
    const reloadSpy = vi.fn();

    vi.mocked(getCookie).mockReturnValue("en-US");
    vi.stubGlobal("location", {
      ...window.location,
      reload: reloadSpy,
    });

    renderWithProviders(<LanguagePicker />);

    await user.click(screen.getByRole("searchbox", { name: /language/i }));
    await user.click(screen.getByRole("option", { name: "Deutsch" }));

    expect(setCookie).toHaveBeenCalledWith(
      "language",
      "de-DE",
      expect.objectContaining({
        sameSite: "lax",
      }),
    );
    expect(reloadSpy).toHaveBeenCalled();
  });

  it("persists theme changes and toggles the resolved color scheme", async () => {
    const user = userEvent.setup();

    vi.mocked(userPreferences.get).mockReturnValue("system");

    renderWithProviders(<ThemeSwitcher />);

    await user.click(screen.getByRole("radio", { name: /light/i }));

    expect(userPreferences.set).toHaveBeenCalledWith("colorScheme", "light");
    expect(toggleColorScheme).toHaveBeenCalledWith("light");
  });
});
