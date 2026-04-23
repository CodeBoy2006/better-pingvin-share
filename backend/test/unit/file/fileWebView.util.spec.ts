import { describe, expect, it } from "@jest/globals";
import {
  canExposeFileWebView,
  getFileWebViewDescriptor,
  getFileWebViewDescriptorFromSample,
  isProbablyText,
} from "src/file/fileWebView.util";

describe("fileWebView.util", () => {
  it("recognizes code and config files that mime-types misses or misclassifies", () => {
    expect(getFileWebViewDescriptor("script.mts")).toEqual({
      kind: "code",
      contentType: "video/mp2t",
      language: "typescript",
    });

    expect(getFileWebViewDescriptor("schema.graphql")).toEqual({
      kind: "code",
      contentType: undefined,
      language: "graphql",
    });

    expect(getFileWebViewDescriptor(".env.local")).toEqual({
      kind: "text",
      contentType: "text/plain",
    });
  });

  it("treats textual samples as web-viewable even when the file name is unknown", () => {
    const sample = new TextEncoder().encode("key=value\nnext=true\n");

    expect(isProbablyText(sample)).toBe(true);
    expect(getFileWebViewDescriptorFromSample(sample)).toEqual({
      kind: "text",
      contentType: "text/plain",
    });
  });

  it("rejects binary samples for raw text web views", () => {
    const sample = new Uint8Array([0x00, 0xff, 0x10, 0x88]);

    expect(isProbablyText(sample)).toBe(false);
    expect(getFileWebViewDescriptorFromSample(sample)).toBeUndefined();
  });

  it("does not size-gate textual web views anymore", () => {
    expect(canExposeFileWebView("logs.csv", 64 * 1024 * 1024, "text/csv")).toBe(
      true,
    );
    expect(
      canExposeFileWebView("archive.zip", 64 * 1024 * 1024, "application/zip"),
    ).toBe(false);
  });
});
