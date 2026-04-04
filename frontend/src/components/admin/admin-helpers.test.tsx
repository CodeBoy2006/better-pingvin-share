import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { createUser } from "../../../test/fixtures";
import { renderWithProviders } from "../../../test/render";

const openConfirmModal = vi.fn();
const openModal = vi.fn((config) => config);

vi.mock("@mantine/modals", async () => {
  const actual = await vi.importActual<typeof import("@mantine/modals")>(
    "@mantine/modals",
  );

  return {
    ...actual,
    useModals: () => ({
      openConfirmModal,
      openModal,
    }),
  };
});

vi.mock("../../services/config.service", async () => {
  const actual = await vi.importActual<typeof import("../../services/config.service")>(
    "../../services/config.service",
  );

  return {
    default: {
      ...actual.default,
      sendTestEmail: vi.fn(),
    },
  };
});

vi.mock("../../services/user.service", () => ({
  default: {
    create: vi.fn(),
  },
}));

vi.mock("../../utils/toast.util", () => ({
  default: {
    axiosError: vi.fn(),
    success: vi.fn(),
  },
}));

import configService from "../../services/config.service";
import userService from "../../services/user.service";
import toast from "../../utils/toast.util";
import ConfigurationHeader from "./configuration/ConfigurationHeader";
import ConfigurationNavBar from "./configuration/ConfigurationNavBar";
import TestEmailButton from "./configuration/TestEmailButton";
import showCreateUserModal from "./users/showCreateUserModal";

describe("admin helpers", () => {
  beforeEach(() => {
    openConfirmModal.mockReset();
    openModal.mockClear();
    vi.mocked(configService.sendTestEmail).mockReset();
    vi.mocked(userService.create).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it("renders the configuration header and toggles the mobile navigation button", async () => {
    const user = userEvent.setup();
    const setIsMobileNavBarOpened = vi.fn();

    renderWithProviders(
      <ConfigurationHeader
        isMobileNavBarOpened={false}
        setIsMobileNavBarOpened={setIsMobileNavBarOpened}
      />,
    );

    expect(screen.getByText("better-pingvin-share")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go back/i })).toHaveAttribute(
      "href",
      "/admin",
    );

    await user.click(screen.getAllByRole("button")[0]);

    expect(setIsMobileNavBarOpened).toHaveBeenCalledTimes(1);
  });

  it("renders configuration navigation links and closes the mobile navbar on click", async () => {
    const user = userEvent.setup();
    const setIsMobileNavBarOpened = vi.fn();

    renderWithProviders(
      <ConfigurationNavBar
        categoryId="email"
        isMobileNavBarOpened={true}
        setIsMobileNavBarOpened={setIsMobileNavBarOpened}
      />,
    );

    const emailLink = screen.getByRole("link", { name: /email/i });

    expect(emailLink).toHaveAttribute("href", "/admin/config/email");

    await user.click(emailLink);

    expect(setIsMobileNavBarOpened).toHaveBeenCalledWith(false);
  });

  it("sends a test email immediately when the configuration is already saved", async () => {
    const user = userEvent.setup();

    vi.mocked(configService.sendTestEmail).mockResolvedValue(undefined);

    renderWithProviders(
      <TestEmailButton
        configVariablesChanged={false}
        saveConfigVariables={vi.fn()}
      />,
      {
        providers: {
          user: createUser({
            email: "admin@example.com",
          }),
        },
      },
    );

    await user.click(screen.getByRole("button", { name: /send test email/i }));

    await waitFor(() => {
      expect(configService.sendTestEmail).toHaveBeenCalledWith(
        "admin@example.com",
      );
    });
    expect(openConfirmModal).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Email sent successfully");
  });

  it("confirms, saves, and then sends the test email when config changes are pending", async () => {
    const user = userEvent.setup();
    const saveConfigVariables = vi.fn().mockResolvedValue(undefined);

    vi.mocked(configService.sendTestEmail).mockResolvedValue(undefined);

    renderWithProviders(
      <TestEmailButton
        configVariablesChanged={true}
        saveConfigVariables={saveConfigVariables}
      />,
      {
        providers: {
          user: createUser({
            email: "admin@example.com",
          }),
        },
      },
    );

    await user.click(screen.getByRole("button", { name: /send test email/i }));

    expect(openConfirmModal).toHaveBeenCalledTimes(1);

    await act(async () => {
      await openConfirmModal.mock.calls[0][0].onConfirm();
    });

    expect(saveConfigVariables).toHaveBeenCalledTimes(1);
    expect(configService.sendTestEmail).toHaveBeenCalledWith(
      "admin@example.com",
    );
  });

  it("creates users through the modal helper and reveals the password field when requested", async () => {
    const user = userEvent.setup();
    const closeAll = vi.fn();
    const getUsers = vi.fn();
    const modals = {
      closeAll,
      openModal,
    };

    vi.mocked(userService.create).mockResolvedValue(undefined);

    const modalConfig = showCreateUserModal(modals as never, true, getUsers);

    renderWithProviders(modalConfig.children);

    expect(
      screen.queryByLabelText(/^password$/i),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText(/^username$/i), "newuser");
    await user.type(screen.getByLabelText(/^email$/i), "new@example.com");
    await user.click(screen.getByRole("checkbox", { name: /set password manually/i }));

    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^password$/i), "Password123!");
    await user.click(screen.getByRole("checkbox", { name: /admin privileges/i }));
    await user.click(screen.getByRole("button", { name: /^create$/i }));

    await waitFor(() => {
      expect(userService.create).toHaveBeenCalledWith({
        email: "new@example.com",
        isAdmin: true,
        password: "Password123!",
        setPasswordManually: true,
        username: "newuser",
      });
    });
    expect(getUsers).toHaveBeenCalledTimes(1);
    expect(closeAll).toHaveBeenCalledTimes(1);
  });
});
