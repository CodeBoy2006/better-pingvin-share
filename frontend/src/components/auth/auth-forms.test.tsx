import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { vi } from "vitest";
import { createConfig, createUser } from "../../../test/fixtures";
import { renderWithProviders } from "../../../test/render";
import { setMockRouter } from "../../../test/router";

vi.mock("@mantine/core", async () => {
  const actual = await vi.importActual<typeof import("@mantine/core")>(
    "@mantine/core",
  );

  return {
    ...actual,
    PinInput: ({
      "aria-label": ariaLabel,
      onChange,
      value = "",
    }: {
      "aria-label"?: string;
      onChange?: (nextValue: string) => void;
      value?: string;
    }) => (
      <input
        aria-label={ariaLabel ?? "One time code"}
        value={value}
        onChange={(event) => {
          onChange?.(event.currentTarget.value);
        }}
      />
    ),
  };
});

vi.mock("../../services/auth.service", () => ({
  default: {
    getAvailableOAuth: vi.fn(),
    signIn: vi.fn(),
    signInTotp: vi.fn(),
    signUp: vi.fn(),
  },
}));

vi.mock("../../utils/toast.util", () => ({
  default: {
    axiosError: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@mantine/notifications", async () => {
  const actual =
    await vi.importActual<typeof import("@mantine/notifications")>(
      "@mantine/notifications",
    );

  return {
    ...actual,
    showNotification: vi.fn(),
  };
});

import { showNotification } from "@mantine/notifications";
import authService from "../../services/auth.service";
import SignInForm from "./SignInForm";
import SignUpForm from "./SignUpForm";
import TotpForm from "./TotpForm";

const axiosResponse = <T,>(data: T) => ({ data }) as any;

const authConfig = [
  createConfig({
    key: "share.allowRegistration",
    type: "boolean",
    value: "true",
  }),
  createConfig({
    key: "smtp.enabled",
    type: "boolean",
    value: "true",
  }),
  createConfig({
    key: "oauth.disablePassword",
    type: "boolean",
    value: "false",
  }),
];

describe("auth forms", () => {
  beforeEach(() => {
    vi.mocked(authService.getAvailableOAuth).mockResolvedValue(
      axiosResponse([]),
    );
  });

  it("signs in with credentials and redirects to a safe path", async () => {
    const user = userEvent.setup();
    const router = setMockRouter();
    const refreshUser = vi.fn().mockResolvedValue(createUser());

    vi.mocked(authService.signIn).mockResolvedValue(axiosResponse({}));

    renderWithProviders(<SignInForm redirectPath="dashboard" />, {
      providers: {
        configVariables: authConfig,
        refreshUser,
      },
    });

    await screen.findByRole("heading", { name: /welcome back/i });

    await user.type(
      screen.getByLabelText(/email or username/i),
      " demo@example.com ",
    );
    await user.type(screen.getByLabelText(/^password$/i), " secret123 ");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(authService.signIn).toHaveBeenCalledWith(
        "demo@example.com",
        "secret123",
      );
      expect(refreshUser).toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("routes to the TOTP flow when the backend returns a login token", async () => {
    const user = userEvent.setup();
    const router = setMockRouter();

    vi.mocked(authService.signIn).mockResolvedValue(
      axiosResponse({ loginToken: "otp-token" }),
    );

    renderWithProviders(<SignInForm redirectPath="/account" />, {
      providers: {
        configVariables: authConfig,
      },
    });

    await screen.findByRole("heading", { name: /welcome back/i });

    await user.type(screen.getByLabelText(/email or username/i), "demo");
    await user.type(screen.getByLabelText(/^password$/i), "password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(showNotification).toHaveBeenCalled();
      expect(router.push).toHaveBeenCalledWith(
        "/auth/totp/otp-token?redirect=%2Faccount",
      );
    });
  });

  it("redirects admins to the intro page after sign up", async () => {
    const user = userEvent.setup();
    const router = setMockRouter();
    const refreshUser = vi.fn().mockResolvedValue(
      createUser({ isAdmin: true, username: "admin" }),
    );

    vi.mocked(authService.signUp).mockResolvedValue(axiosResponse({}));

    renderWithProviders(<SignUpForm />, {
      providers: {
        configVariables: authConfig,
        refreshUser,
      },
    });

    await screen.findByRole("heading", { name: /create an account/i });

    await user.type(screen.getByLabelText(/username/i), "admin");
    await user.type(screen.getByLabelText(/^email$/i), "admin@example.com");
    await user.type(screen.getByLabelText(/^password$/i), "password123");
    await user.click(
      screen.getByRole("button", { name: /let's get started/i }),
    );

    await waitFor(() => {
      expect(authService.signUp).toHaveBeenCalledWith(
        "admin@example.com",
        "admin",
        "password123",
      );
      expect(router.replace).toHaveBeenCalledWith("/admin/intro");
    });
  });

  it("submits a totp code and redirects after verification", async () => {
    const user = userEvent.setup();
    const router = setMockRouter({
      query: {
        loginToken: "login-token",
      },
    });
    const refreshUser = vi.fn().mockResolvedValue(createUser());

    vi.mocked(authService.signInTotp).mockResolvedValue(axiosResponse({}));

    renderWithProviders(<TotpForm redirectPath="shared" />, {
      providers: {
        refreshUser,
      },
    });

    await user.type(screen.getByLabelText(/one time code/i), "123456");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(authService.signInTotp).toHaveBeenCalledWith(
        "123456",
        "login-token",
      );
      expect(refreshUser).toHaveBeenCalled();
      expect(router.replace).toHaveBeenCalledWith("/shared");
    });
  });
});
