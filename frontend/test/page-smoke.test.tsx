import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import { vi } from "vitest";
import {
  createApiToken,
  createConfig,
  createMyShare,
  createShare,
  createUser,
} from "./fixtures";
import { renderWithProviders } from "./render";
import { setMockRouter } from "./router";

vi.mock("../src/hooks/confirm-leave.hook", () => ({
  default: vi.fn(),
}));

vi.mock("../src/components/upload/Dropzone", () => ({
  default: ({
    onFilesChanged,
  }: {
    onFilesChanged: (files: Array<File & { uploadingProgress: number }>) => void;
  }) => (
    <button
      onClick={() => {
        const file = new File(["demo"], "page-test.txt", {
          type: "text/plain",
        }) as File & { uploadingProgress: number };

        file.uploadingProgress = 0;

        onFilesChanged([file]);
      }}
    >
      Add mock file
    </button>
  ),
}));

vi.mock("../src/components/upload/FileList", () => ({
  default: ({ files }: { files: unknown[] }) => (
    <div>Upload file list ({files.length})</div>
  ),
}));

vi.mock("../src/components/share/FileList", () => ({
  default: ({ files }: { files?: unknown[] }) => (
    <div>Share file list ({files?.length ?? 0})</div>
  ),
}));

vi.mock("../src/components/share/DownloadAllButton", () => ({
  default: ({ shareId }: { shareId: string }) => (
    <div>Download all for {shareId}</div>
  ),
}));

vi.mock("../src/components/admin/configuration/ConfigurationNavBar", () => ({
  default: () => <div>Configuration navigation</div>,
}));

vi.mock("../src/components/admin/configuration/ConfigurationHeader", () => ({
  default: () => <div>Configuration header</div>,
}));

vi.mock("../src/components/admin/configuration/AdminConfigInput", () => ({
  default: ({ configVariable }: { configVariable: { key: string } }) => (
    <div>Config input: {configVariable.key}</div>
  ),
}));

vi.mock("../src/components/admin/configuration/LogoConfigInput", () => ({
  default: () => <div>Logo input</div>,
}));

vi.mock("../src/components/admin/configuration/TestEmailButton", () => ({
  default: () => <button>Send test email</button>,
}));

vi.mock("../src/components/core/CenterLoader", () => ({
  default: () => <div>Loading…</div>,
}));

vi.mock("../src/components/upload/modals/showCreateUploadModal", () => ({
  default: vi.fn(),
}));

vi.mock("../src/components/upload/modals/showCompletedUploadModal", () => ({
  default: vi.fn(),
}));

vi.mock("../src/components/account/showShareInformationsModal", () => ({
  default: vi.fn(),
}));

vi.mock("../src/components/account/showShareLinkModal", () => ({
  default: vi.fn(),
}));

vi.mock("../src/components/account/showReverseShareLinkModal", () => ({
  default: vi.fn(),
}));

vi.mock("../src/components/share/modals/showCreateReverseShareModal", () => ({
  default: vi.fn(),
}));

vi.mock("../src/components/admin/users/showCreateUserModal", () => ({
  default: vi.fn(),
}));

vi.mock("../src/services/share.service", async () => {
  const actual = await vi.importActual<
    typeof import("../src/services/share.service")
  >(
    "../src/services/share.service",
  );

  return {
    default: {
      ...actual.default,
      get: vi.fn(),
      getMyReverseShares: vi.fn(),
      getMyShares: vi.fn(),
    },
  };
});

vi.mock("../src/services/config.service", async () => {
  const actual = await vi.importActual<
    typeof import("../src/services/config.service")
  >(
    "../src/services/config.service",
  );

  return {
    default: {
      ...actual.default,
      getByCategory: vi.fn(),
      isNewReleaseAvailable: vi.fn(),
    },
  };
});

vi.mock("../src/services/user.service", () => ({
  default: {
    list: vi.fn(),
    removeCurrentUser: vi.fn(),
    updateCurrentUser: vi.fn(),
  },
}));

vi.mock("../src/services/auth.service", () => ({
  default: {
    disableTOTP: vi.fn(),
    enableTOTP: vi.fn(),
    getAvailableOAuth: vi.fn(),
    getOAuthStatus: vi.fn(),
    updatePassword: vi.fn(),
  },
}));

vi.mock("../src/services/apiToken.service", () => ({
  default: {
    create: vi.fn(),
    list: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("../src/utils/toast.util", () => ({
  default: {
    axiosError: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import apiTokenService from "../src/services/apiToken.service";
import authService from "../src/services/auth.service";
import configService from "../src/services/config.service";
import shareService from "../src/services/share.service";
import userService from "../src/services/user.service";
import AccountPage from "../src/pages/account/index";
import AccountReverseSharesPage from "../src/pages/account/reverseShares";
import AccountSharesPage from "../src/pages/account/shares";
import AdminConfigPage from "../src/pages/admin/config/[category]";
import AdminPage from "../src/pages/admin/index";
import AdminUsersPage from "../src/pages/admin/users";
import HomePage from "../src/pages/index";
import SharePage from "../src/pages/share/[shareId]/index";
import UploadPage from "../src/pages/upload/index";

const axiosResponse = <T,>(data: T) => ({ data }) as any;

const baseUploadConfig = [
  createConfig({
    key: "share.chunkSize",
    type: "number",
    value: "1048576",
  }),
  createConfig({
    key: "share.maxSize",
    type: "filesize",
    value: "10485760",
  }),
  createConfig({
    key: "share.autoOpenShareModal",
    type: "boolean",
    value: "false",
  }),
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
];

describe("page smoke tests", () => {
  beforeEach(() => {
    setMockRouter();

    vi.mocked(authService.getAvailableOAuth).mockResolvedValue(
      axiosResponse([]),
    );
    vi.mocked(authService.getOAuthStatus).mockResolvedValue(
      axiosResponse({}),
    );
    vi.mocked(apiTokenService.list).mockResolvedValue([]);
    vi.mocked(shareService.getMyShares).mockResolvedValue([]);
    vi.mocked(shareService.getMyReverseShares).mockResolvedValue([]);
    vi.mocked(configService.isNewReleaseAvailable).mockResolvedValue(false);
    vi.mocked(configService.getByCategory).mockResolvedValue([]);
    vi.mocked(userService.list).mockResolvedValue([]);
  });

  it("shows the public home page for signed-out users", async () => {
    const refreshUser = vi.fn().mockResolvedValue(null);

    renderWithProviders(<HomePage />, {
      providers: {
        configVariables: baseUploadConfig,
        refreshUser,
      },
    });

    expect(
      await screen.findByRole("link", { name: /get started/i }),
    ).toHaveAttribute("href", "/auth/signUp");
    expect(refreshUser).toHaveBeenCalled();
  });

  it("redirects authenticated users away from the home page", async () => {
    const router = setMockRouter();
    const refreshUser = vi.fn().mockResolvedValue(createUser());

    renderWithProviders(<HomePage />, {
      providers: {
        configVariables: baseUploadConfig,
        refreshUser,
      },
    });

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith("/upload");
    });
  });

  it("renders the upload page and enables sharing once files are selected", async () => {
    const user = userEvent.setup();

    setMockRouter({ pathname: "/upload" });

    renderWithProviders(
      <UploadPage isReverseShare={false} simplified={false} />,
      {
        providers: {
          configVariables: baseUploadConfig,
          user: createUser(),
        },
      },
    );

    expect(
      screen.getByRole("button", { name: /^share$/i }),
    ).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /add mock file/i }));

    expect(screen.getByText(/upload file list \(1\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^share$/i })).toBeEnabled();
  });

  it("renders a share page with metadata and file actions", async () => {
    vi.mocked(shareService.get).mockResolvedValue(
      createShare({
        files: [
          { id: "file-1", name: "a.txt", size: "10" },
          { id: "file-2", name: "b.txt", size: "20" },
        ],
        id: "share-42",
        name: "Project handoff",
      }),
    );

    renderWithProviders(<SharePage shareId="share-42" />);

    expect(await screen.findByRole("heading", { name: /project handoff/i })).toBeInTheDocument();
    expect(screen.getByText(/share file list \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText(/download all for share-42/i)).toBeInTheDocument();
  });

  it("renders account overview content with automation settings", async () => {
    vi.mocked(authService.getAvailableOAuth).mockResolvedValue(
      axiosResponse(["github"]),
    );
    vi.mocked(apiTokenService.list).mockResolvedValue([createApiToken()]);

    renderWithProviders(<AccountPage />, {
      providers: {
        user: createUser(),
      },
    });

    expect(await screen.findByRole("heading", { name: /my account/i })).toBeInTheDocument();
    expect(screen.getByText(/api tokens/i)).toBeInTheDocument();
    expect(screen.getByText(/color scheme/i)).toBeInTheDocument();
  });

  it("renders the account shares page empty state", async () => {
    renderWithProviders(<AccountSharesPage />, {
      providers: {
        configVariables: baseUploadConfig,
      },
    });

    expect(
      await screen.findByRole("heading", { name: /my shares/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /create one/i }),
    ).toBeInTheDocument();
  });

  it("renders the reverse shares page empty state", async () => {
    renderWithProviders(<AccountReverseSharesPage />, {
      providers: {
        configVariables: baseUploadConfig,
      },
    });

    expect(
      await screen.findByRole("heading", { name: /reverse shares/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create$/i })).toBeInTheDocument();
  });

  it("renders the admin landing page links", async () => {
    renderWithProviders(<AdminPage />);

    expect(
      await screen.findByRole("heading", { name: /administration/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /user management/i })).toHaveAttribute(
      "href",
      "/admin/users",
    );
  });

  it("renders the admin users page with create controls", async () => {
    renderWithProviders(<AdminUsersPage />, {
      providers: {
        configVariables: baseUploadConfig,
      },
    });

    expect(
      await screen.findByRole("heading", { name: /user management/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^create$/i })).toBeInTheDocument();
  });

  it("renders the admin config page for a selected category", async () => {
    setMockRouter({
      query: {
        category: "general",
      },
    });

    vi.mocked(configService.getByCategory).mockResolvedValue([
      createConfig({
        key: "general.appUrl",
        type: "string",
        value: "https://example.com",
      }),
    ]);

    renderWithProviders(<AdminConfigPage />, {
      providers: {
        configVariables: baseUploadConfig,
      },
    });

    expect(await screen.findByText(/configuration navigation/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /general/i })).toBeInTheDocument();
    expect(screen.getByText(/config input: general\.appUrl/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument();
  });
});
