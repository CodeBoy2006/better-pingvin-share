import { describe, expect, it } from "vitest";
import {
  MAX_OFFICE_PREVIEW_BYTES,
  MAX_SNIFFABLE_PREVIEW_BYTES,
  MAX_TEXT_PREVIEW_BYTES,
  canPreviewFileByName,
  decodePreviewText,
  detectTextPreviewDescriptor,
  getPreviewMimeType,
  guessFilePreviewDescriptor,
  isOfficePreviewKind,
  isProbablyText,
  sniffBinaryPreviewDescriptor,
} from "../../../src/utils/filePreview.util";

describe("filePreview.util", () => {
  it("guesses preview descriptors from file names and mime types", () => {
    expect(guessFilePreviewDescriptor("README.md")).toEqual({
      kind: "markdown",
      mimeType: "text/markdown",
    });

    expect(guessFilePreviewDescriptor("script.ts")).toEqual({
      kind: "code",
      language: "typescript",
      mimeType: "video/mp2t",
    });

    expect(guessFilePreviewDescriptor("spreadsheet.xlsx")).toEqual({
      kind: "spreadsheet",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(guessFilePreviewDescriptor("archive.unknown")).toEqual({
      kind: "unsupported",
      mimeType: undefined,
    });
  });

  it("reports preview support thresholds by file kind", () => {
    expect(canPreviewFileByName("preview.txt", MAX_TEXT_PREVIEW_BYTES)).toBe(
      true,
    );
    expect(
      canPreviewFileByName("preview.txt", MAX_TEXT_PREVIEW_BYTES + 1),
    ).toBe(false);

    expect(
      canPreviewFileByName("presentation.pptx", MAX_OFFICE_PREVIEW_BYTES),
    ).toBe(true);
    expect(
      canPreviewFileByName("presentation.pptx", MAX_OFFICE_PREVIEW_BYTES + 1),
    ).toBe(false);

    expect(
      canPreviewFileByName("blob.bin", MAX_SNIFFABLE_PREVIEW_BYTES + 1),
    ).toBe(false);
  });

  it("sniffs binary signatures for supported preview types", () => {
    expect(
      sniffBinaryPreviewDescriptor(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00]),
      ),
    ).toEqual({
      kind: "image",
      mimeType: "image/png",
    });

    expect(
      sniffBinaryPreviewDescriptor(
        new Uint8Array([
          0x00,
          0x00,
          0x00,
          0x20,
          0x66,
          0x74,
          0x79,
          0x70,
          0x69,
          0x73,
          0x6f,
          0x6d,
        ]),
      ),
    ).toEqual({
      kind: "video",
      mimeType: "video/mp4",
    });

    expect(
      sniffBinaryPreviewDescriptor(new Uint8Array([0x00, 0x01, 0x02, 0x03])),
    ).toBeUndefined();
  });

  it("distinguishes likely text from binary content", () => {
    expect(isProbablyText(new TextEncoder().encode("hello world"))).toBe(true);
    expect(isProbablyText(new Uint8Array([0x00, 0xff, 0x10]))).toBe(false);
  });

  it("decodes preview text as UTF-8", () => {
    expect(decodePreviewText(new TextEncoder().encode("你好"))).toBe("你好");
  });

  it("detects text preview kinds from content", () => {
    expect(
      detectTextPreviewDescriptor("README", "# Heading\n\n- item"),
    ).toEqual({
      kind: "markdown",
      mimeType: "text/markdown",
    });

    expect(
      detectTextPreviewDescriptor(
        "script",
        "#!/usr/bin/env python\nprint('pingvin')",
      ),
    ).toEqual({
      kind: "code",
      language: "python",
    });

    expect(detectTextPreviewDescriptor("notes.txt", "plain text")).toEqual({
      kind: "text",
      language: "text",
      mimeType: getPreviewMimeType("notes.txt"),
    });
  });

  it("recognizes office preview kinds", () => {
    expect(isOfficePreviewKind("word")).toBe(true);
    expect(isOfficePreviewKind("image")).toBe(false);
  });
});
