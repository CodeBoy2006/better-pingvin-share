import { describe, expect, it } from "vitest";
import {
  byteToHumanSizeString,
  byteToUnitAndSize,
  unitAndSizeToByte,
} from "../../../src/utils/fileSize.util";

describe("fileSize.util", () => {
  it("formats byte sizes into human-readable strings", () => {
    expect(byteToHumanSizeString(0)).toBe("0 Byte");
    expect(byteToHumanSizeString(1_500)).toBe("1.5 KB");
    expect(byteToHumanSizeString(2_500_000)).toBe("2.5 MB");
  });

  it("splits byte sizes into numeric size and unit", () => {
    expect(byteToUnitAndSize(0)).toEqual({ unit: "B", size: 0 });
    expect(byteToUnitAndSize(1_500_000)).toEqual({
      size: 1.5,
      unit: "MB",
    });
  });

  it("converts units back to bytes", () => {
    expect(unitAndSizeToByte("B", 512)).toBe(512);
    expect(unitAndSizeToByte("GB", 1.5)).toBe(1_500_000_000);
  });
});
