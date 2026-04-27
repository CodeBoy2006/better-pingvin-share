import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { createMyShare } from "../../../test/fixtures";
import { renderWithProviders } from "../../../test/render";

vi.mock("@mantine/core", async () => {
  const actual =
    await vi.importActual<typeof import("@mantine/core")>("@mantine/core");

  return {
    ...actual,
    Collapse: ({
      children,
      in: isOpen,
    }: {
      children: ReactNode;
      in: boolean;
    }) => (isOpen ? <div>{children}</div> : null),
  };
});

vi.mock("../share/QRCode", () => ({
  default: ({ link }: { link: string }) => (
    <div data-testid="qr-code">{link}</div>
  ),
}));

vi.mock("../upload/CopyTextField", () => ({
  default: ({
    label = "Link",
    link,
    toggleQR,
  }: {
    label?: string;
    link: string;
    toggleQR?: () => void;
  }) => (
    <div>
      <label>
        {label}
        <input aria-label={label} readOnly value={link} />
      </label>
      {toggleQR ? <button onClick={toggleQR}>Toggle QR</button> : null}
    </div>
  ),
}));

import showReverseShareLinkModal from "./showReverseShareLinkModal";
import showShareInformationsModal from "./showShareInformationsModal";
import showShareLinkModal from "./showShareLinkModal";

const createModalsMock = () => ({
  openModal: vi.fn((config) => config),
});

describe("account modal helpers", () => {
  it("opens the reverse-share link modal with the generated upload URL", () => {
    const modals = createModalsMock();

    showReverseShareLinkModal(modals as never, "reverse-token");
    const [config] = modals.openModal.mock.calls[0];

    expect(modals.openModal).toHaveBeenCalledTimes(1);
    renderWithProviders(config.children);

    expect(
      screen.getByDisplayValue(
        `${window.location.origin}/upload/reverse-token`,
      ),
    ).toBeInTheDocument();
  });

  it("opens the share-link modal and reveals the QR code on demand", async () => {
    const user = userEvent.setup();
    const modals = createModalsMock();

    showShareLinkModal(modals as never, "share-123");
    const [config] = modals.openModal.mock.calls[0];

    renderWithProviders(config.children);

    expect(
      screen.getByDisplayValue(`${window.location.origin}/s/share-123`),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(
        `${window.location.origin}/s/share-123/files.json`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(
        `${window.location.origin}/s/share-123/files.txt`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("qr-code")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /toggle qr/i }));

    expect(screen.getByTestId("qr-code")).toBeInTheDocument();
    expect(screen.getByTestId("qr-code")).toHaveTextContent(
      `${window.location.origin}/s/share-123`,
    );
  });

  it("renders share information details, storage usage, and files.json access", async () => {
    const user = userEvent.setup();
    const modals = createModalsMock();
    const share = createMyShare({
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
      description: "Release checklist",
      expiration: new Date(0),
      id: "share-42",
      name: "Operations handoff",
      size: 512,
    });

    showShareInformationsModal(modals as never, share, 1024);
    const [config] = modals.openModal.mock.calls[0];

    renderWithProviders(config.children);

    expect(screen.getByText("share-42")).toBeInTheDocument();
    expect(screen.getByText("Operations handoff")).toBeInTheDocument();
    expect(screen.getByText("Release checklist")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(`${window.location.origin}/s/share-42`),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(
        `${window.location.origin}/s/share-42/files.json`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(
        `${window.location.origin}/s/share-42/files.txt`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/512\.0 b \/ 1\.0 kb \(50\.0%\)/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("qr-code")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /toggle qr/i }));

    expect(screen.getByTestId("qr-code")).toBeInTheDocument();
    expect(screen.getByTestId("qr-code")).toHaveTextContent(
      `${window.location.origin}/s/share-42`,
    );
  });
});
