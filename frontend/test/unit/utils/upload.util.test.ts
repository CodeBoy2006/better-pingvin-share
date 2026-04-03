import { describe, expect, it } from "vitest";
import {
  getUnexpectedChunkIndex,
  getUploadErrorMessage,
  isPermanentUploadError,
} from "../../../src/utils/upload.util";

describe("upload.util", () => {
  it("extracts the expected chunk index from chunk mismatch responses", () => {
    expect(
      getUnexpectedChunkIndex({
        response: {
          data: {
            error: "unexpected_chunk_index",
            expectedChunkIndex: 4,
          },
        },
      }),
    ).toBe(4);

    expect(getUnexpectedChunkIndex(new Error("network"))).toBeUndefined();
  });

  it("classifies permanent upload failures", () => {
    expect(
      isPermanentUploadError({
        response: {
          status: 413,
          data: {
            message: "Too large",
          },
        },
      }),
    ).toBe(true);

    expect(
      isPermanentUploadError({
        response: {
          status: 429,
          data: {
            message: "Rate limited",
          },
        },
      }),
    ).toBe(false);

    expect(
      isPermanentUploadError({
        response: {
          status: 500,
          data: {
            message: "Not enough space on the server",
          },
        },
      }),
    ).toBe(true);
  });

  it("prefers backend error messages and falls back to generic ones", () => {
    expect(
      getUploadErrorMessage({
        message: "request failed",
        response: {
          status: 500,
          data: {
            message: "Backend failure",
          },
        },
      }),
    ).toBe("Backend failure");

    expect(getUploadErrorMessage(new Error("Timed out"))).toBe("Timed out");
    expect(getUploadErrorMessage("unknown")).toBe("An unknown error occurred");
  });
});
