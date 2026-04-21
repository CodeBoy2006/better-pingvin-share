import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const { proxyShareFileListResponse } = vi.hoisted(() => ({
  proxyShareFileListResponse: vi.fn(),
}));

vi.mock("../../../src/utils/shareFileListPage.util", () => ({
  proxyShareFileListResponse,
}));

import ShareAliasPage, {
  getServerSideProps as getShareAliasProps,
} from "../../../src/pages/s/[shareId]";
import ShareFileListAliasPage, {
  getServerSideProps as getShareFileListAliasProps,
} from "../../../src/pages/s/[shareId]/files.json";
import ShareFileListPage, {
  getServerSideProps as getShareFileListProps,
} from "../../../src/pages/share/[shareId]/files.json";

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

  it("renders null for alias pages because they are server-side redirects or proxies", () => {
    const shareAliasRender = render(<ShareAliasPage />);
    const shareFileListAliasRender = render(<ShareFileListAliasPage />);
    const shareFileListRender = render(<ShareFileListPage />);

    expect(shareAliasRender.container.firstChild).toBeNull();
    expect(shareFileListAliasRender.container.firstChild).toBeNull();
    expect(shareFileListRender.container.firstChild).toBeNull();
  });
});
