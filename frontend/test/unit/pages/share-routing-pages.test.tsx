import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const {
  proxyShareFileListResponse,
  proxySharePlainTextFileListResponse,
} = vi.hoisted(() => ({
  proxyShareFileListResponse: vi.fn(),
  proxySharePlainTextFileListResponse: vi.fn(),
}));

vi.mock("../../../src/utils/shareFileListPage.util", () => ({
  proxyShareFileListResponse,
  proxySharePlainTextFileListResponse,
}));

import ShareAliasPage, {
  getServerSideProps as getShareAliasProps,
} from "../../../src/pages/s/[shareId]";
import ShareFileListAliasPage, {
  getServerSideProps as getShareFileListAliasProps,
} from "../../../src/pages/s/[shareId]/files.json";
import SharePlainTextFileListAliasPage, {
  getServerSideProps as getSharePlainTextFileListAliasProps,
} from "../../../src/pages/s/[shareId]/files.txt";
import ShareFileListPage, {
  getServerSideProps as getShareFileListProps,
} from "../../../src/pages/share/[shareId]/files.json";
import SharePlainTextFileListPage, {
  getServerSideProps as getSharePlainTextFileListProps,
} from "../../../src/pages/share/[shareId]/files.txt";

describe("share routing pages", () => {
  it("redirects short share aliases to the canonical share page", () => {
    expect(
      getShareAliasProps({
        params: { shareId: "demo-share" },
      } as any),
    ).toEqual({
      props: {},
      redirect: {
        permanent: false,
        destination: "/share/demo-share",
      },
    });
  });

  it("re-exports the files.json proxy for both public file-list routes", () => {
    expect(getShareFileListAliasProps).toBe(proxyShareFileListResponse);
    expect(getShareFileListProps).toBe(proxyShareFileListResponse);
  });

  it("re-exports the files.txt proxy for both public file-list routes", () => {
    expect(getSharePlainTextFileListAliasProps).toBe(
      proxySharePlainTextFileListResponse,
    );
    expect(getSharePlainTextFileListProps).toBe(
      proxySharePlainTextFileListResponse,
    );
  });

  it("renders null for alias pages because they are server-side redirects or proxies", () => {
    const shareAliasRender = render(<ShareAliasPage />);
    const shareFileListAliasRender = render(<ShareFileListAliasPage />);
    const shareFileListRender = render(<ShareFileListPage />);
    const sharePlainTextFileListAliasRender = render(
      <SharePlainTextFileListAliasPage />,
    );
    const sharePlainTextFileListRender = render(<SharePlainTextFileListPage />);

    expect(shareAliasRender.container.firstChild).toBeNull();
    expect(shareFileListAliasRender.container.firstChild).toBeNull();
    expect(shareFileListRender.container.firstChild).toBeNull();
    expect(sharePlainTextFileListAliasRender.container.firstChild).toBeNull();
    expect(sharePlainTextFileListRender.container.firstChild).toBeNull();
  });
});
