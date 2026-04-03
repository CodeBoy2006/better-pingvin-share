import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getExpirationPreview,
  stringToTimespan,
  timespanToString,
} from "../../../src/utils/date.util";

describe("date.util", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T10:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns the never expires label when the form is configured accordingly", () => {
    expect(
      getExpirationPreview(
        {
          neverExpires: "Never expires",
          expiresOn: "Expires on {expiration}",
        },
        {
          values: {
            never_expires: true,
            expiration_num: 7,
            expiration_unit: "-days",
          },
        },
      ),
    ).toBe("Never expires");
  });

  it("renders a formatted expiration preview from the relative duration", () => {
    const preview = getExpirationPreview(
      {
        neverExpires: "Never expires",
        expiresOn: "Expires on {expiration}",
      },
      {
        values: {
          never_expires: false,
          expiration_num: 2,
          expiration_unit: "-days",
        },
      },
    );

    expect(preview).toContain("April 5, 2026 10:00 AM");
  });

  it("converts timespans to and from their string representation", () => {
    expect(timespanToString({ value: 7, unit: "days" })).toBe("7 days");
    expect(stringToTimespan("12 hours")).toEqual({
      value: 12,
      unit: "hours",
    });
  });
});
