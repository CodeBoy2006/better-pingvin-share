import { describe, expect, it } from "vitest";
import {
  camelToKebab,
  capitalizeFirstLetter,
} from "../../../src/utils/string.util";

describe("string.util", () => {
  it("converts camelCase strings to kebab-case", () => {
    expect(camelToKebab("shareFileList")).toBe("share-file-list");
  });

  it("capitalizes the first letter of a string", () => {
    expect(capitalizeFirstLetter("pingvin")).toBe("Pingvin");
  });
});
