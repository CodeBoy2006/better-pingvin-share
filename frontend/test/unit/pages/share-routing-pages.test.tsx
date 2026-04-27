import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

const {
  proxyShareFileByNameResponse,
  proxyShareFileListResponse,
  proxyShareFileWebViewByNameResponse,
  proxySharePlainTextFileListResponse,
} = vi.hoisted(() => ({
  proxyShareFileByNameResponse: vi.fn(),
  proxyShareFileListResponse: vi.fn(),
  proxyShareFileWebViewByNameResponse: vi.fn(),
  proxySharePlainTextFileListResponse: vi.fn(),
}));

vi.mock("../../../src/utils/shareFileListPage.util", () => ({
  proxyShareFileByNameResponse,
  proxyShareFileListResponse,
  proxyShareFileWebViewByNameResponse,
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
import ShareFileByNameAliasPage, {
  getServerSideProps as getShareFileByNameAliasProps,
} from "../../../src/pages/s/[shareId]/file/[fileName]";
import ShareFileWebViewByNameAliasPage, {
  getServerSideProps as getShareFileWebViewByNameAliasProps,
} from "../../../src/pages/s/[shareId]/file/[fileName]/web";
import ShareFileListPage, {
  getServerSideProps as getShareFileListProps,
} from "../../../src/pages/share/[shareId]/files.json";
import SharePlainTextFileListPage, {
  getServerSideProps as getSharePlainTextFileListProps,
} from "../../../src/pages/share/[shareId]/files.txt";
import ShareFileByNamePage, {
  getServerSideProps as getShareFileByNameProps,
} from "../../../src/pages/share/[shareId]/file/[fileName]";
import ShareFileWebViewByNamePage, {
  getServerSideProps as getShareFileWebViewByNameProps,
} from "../../../src/pages/share/[shareId]/file/[fileName]/web";

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

  it("re-exports filename-based file proxies for both public routes", () => {
    expect(getShareFileByNameAliasProps).toBe(proxyShareFileByNameResponse);
    expect(getShareFileByNameProps).toBe(proxyShareFileByNameResponse);
    expect(getShareFileWebViewByNameAliasProps).toBe(
      proxyShareFileWebViewByNameResponse,
    );
    expect(getShareFileWebViewByNameProps).toBe(
      proxyShareFileWebViewByNameResponse,
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
    const shareFileByNameAliasRender = render(<ShareFileByNameAliasPage />);
    const shareFileByNameRender = render(<ShareFileByNamePage />);
    const shareFileWebViewByNameAliasRender = render(
      <ShareFileWebViewByNameAliasPage />,
    );
    const shareFileWebViewByNameRender = render(<ShareFileWebViewByNamePage />);

    expect(shareAliasRender.container.firstChild).toBeNull();
    expect(shareFileListAliasRender.container.firstChild).toBeNull();
    expect(shareFileListRender.container.firstChild).toBeNull();
    expect(sharePlainTextFileListAliasRender.container.firstChild).toBeNull();
    expect(sharePlainTextFileListRender.container.firstChild).toBeNull();
    expect(shareFileByNameAliasRender.container.firstChild).toBeNull();
    expect(shareFileByNameRender.container.firstChild).toBeNull();
    expect(shareFileWebViewByNameAliasRender.container.firstChild).toBeNull();
    expect(shareFileWebViewByNameRender.container.firstChild).toBeNull();
  });
});
