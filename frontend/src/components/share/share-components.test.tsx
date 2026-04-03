import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useModals } from "@mantine/modals";
import { vi } from "vitest";
import { createFileMeta, createShare } from "../../../test/fixtures";
import { renderWithProviders } from "../../../test/render";
import { setMockRouter } from "../../../test/router";

vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn(),
  },
}));

vi.mock("../../services/share.service", async () => {
  const actual = await vi.importActual<typeof import("../../services/share.service")>(
    "../../services/share.service",
  );

  return {
    default: {
      ...actual.default,
      downloadFile: vi.fn(),
      getMetaData: vi.fn(),
    },
  };
});

vi.mock("../../services/api.service", () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock("../../utils/toast.util", () => ({
  default: {
    axiosError: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./modals/showFilePreviewModal", () => ({
  default: vi.fn(),
}));

import QRCodeGenerator from "qrcode";
import api from "../../services/api.service";
import shareService from "../../services/share.service";
import toast from "../../utils/toast.util";
import DownloadAllButton from "./DownloadAllButton";
import FileList from "./FileList";
import QRCode from "./QRCode";
import showEnterPasswordModal from "./showEnterPasswordModal";
import showErrorModal from "./showErrorModal";
import showFilePreviewModal from "./modals/showFilePreviewModal";

function ErrorModalHarness() {
  const modals = useModals();

  return (
    <button
      onClick={() =>
        showErrorModal(modals, "Share not found", "The share is gone.", "go-home")
      }
    >
      Open error modal
    </button>
  );
}

function PasswordModalHarness({
  submitCallback,
}: {
  submitCallback: (password: string) => Promise<void>;
}) {
  const modals = useModals();

  return (
    <button onClick={() => showEnterPasswordModal(modals, submitCallback)}>
      Open password modal
    </button>
  );
}

describe("share components", () => {
  beforeEach(() => {
    setMockRouter();
  });

  it("renders a QR code image after generating it", async () => {
    vi.mocked(QRCodeGenerator.toDataURL).mockResolvedValue(
      "data:image/png;base64,abc" as never,
    );

    renderWithProviders(<QRCode link="https://example.com/share/demo" />);

    expect(await screen.findByRole("img", { name: /qrcode/i })).toHaveAttribute(
      "src",
      "data:image/png;base64,abc",
    );
  });

  it("downloads files and opens previews from the share file list", async () => {
    const user = userEvent.setup();
    const setShare = vi.fn();
    const share = createShare({
      files: [
        createFileMeta({
          id: "file-42",
          name: "notes.txt",
          size: "24",
        }),
      ],
    });

    renderWithProviders(
      <FileList
        files={share.files}
        isLoading={false}
        setShare={setShare}
        share={share}
      />,
    );

    const row = screen.getByRole("row", { name: /notes\.txt/i });

    await user.click(within(row).getByRole("button", { name: /preview notes\.txt/i }));
    await user.click(within(row).getByRole("button", { name: /download notes\.txt/i }));

    expect(showFilePreviewModal).toHaveBeenCalledWith(
      "share-1",
      expect.objectContaining({ id: "file-42" }),
      expect.any(Object),
    );
    expect(shareService.downloadFile).toHaveBeenCalledWith("share-1", "file-42");
  });

  it("waits for zip readiness before downloading everything", async () => {
    const user = userEvent.setup();

    vi.mocked(shareService.getMetaData).mockResolvedValue({
      id: "share-1",
      isZipReady: true,
    });
    vi.mocked(shareService.downloadFile).mockResolvedValue(undefined);

    renderWithProviders(<DownloadAllButton shareId="share-1" />);

    await waitFor(() => {
      expect(shareService.getMetaData).toHaveBeenCalledWith("share-1");
    });

    await user.click(screen.getByRole("button", { name: /download all/i }));

    expect(shareService.downloadFile).toHaveBeenCalledWith("share-1", "zip");
  });

  it("shows a preparing message when the zip is not ready yet", async () => {
    const user = userEvent.setup();

    vi.mocked(shareService.getMetaData).mockResolvedValue({
      id: "share-1",
      isZipReady: false,
    });

    renderWithProviders(<DownloadAllButton shareId="share-1" />);

    await user.click(screen.getByRole("button", { name: /download all/i }));

    expect(toast.error).toHaveBeenCalled();
  });

  it("opens an error modal and routes home from its action button", async () => {
    const user = userEvent.setup();
    const router = setMockRouter();

    renderWithProviders(<ErrorModalHarness />);

    await user.click(screen.getByRole("button", { name: /open error modal/i }));
    await user.click(screen.getByRole("button", { name: /go home/i }));

    expect(router.push).toHaveBeenCalledWith("/");
  });

  it("opens a password modal and forwards the submitted password", async () => {
    const user = userEvent.setup();
    const submitCallback = vi.fn().mockResolvedValue(undefined);

    renderWithProviders(<PasswordModalHarness submitCallback={submitCallback} />);

    await user.click(screen.getByRole("button", { name: /open password modal/i }));
    await user.type(screen.getByPlaceholderText(/^password$/i), "secret-pass");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(submitCallback).toHaveBeenCalledWith("secret-pass");
  });
});
