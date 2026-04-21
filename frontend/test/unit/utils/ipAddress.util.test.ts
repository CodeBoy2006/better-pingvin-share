import { describe, expect, it } from "vitest";
import { normalizeIpAddress } from "../../../src/utils/ipAddress.util";

describe("ipAddress.util", () => {
  it("normalizes IPv4 addresses and strips ports", () => {
    expect(normalizeIpAddress("192.168.001.010")).toBe("192.168.1.10");
    expect(normalizeIpAddress("203.0.113.42:8080")).toBe("203.0.113.42");
    expect(normalizeIpAddress(" 10.0.0.5 ")).toBe("10.0.0.5");
  });

  it("normalizes IPv6 addresses, brackets, and zone identifiers", () => {
    expect(normalizeIpAddress("2001:0DB8:0000:0000:0000:0000:0000:0001")).toBe(
      "2001:db8::1",
    );
    expect(normalizeIpAddress("[2001:db8::5]:8443")).toBe("2001:db8::5");
    expect(normalizeIpAddress("fe80::1%en0")).toBe("fe80::1");
  });

  it("supports comma-separated proxy headers and IPv4-mapped IPv6 addresses", () => {
    expect(normalizeIpAddress("::ffff:198.51.100.10, 198.51.100.11")).toBe(
      "198.51.100.10",
    );
    expect(normalizeIpAddress("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("normalizes embedded IPv4 values inside IPv6 addresses", () => {
    expect(normalizeIpAddress("2001:db8::192.168.0.1")).toBe(
      "2001:db8::c0a8:1",
    );
  });

  it("returns undefined for malformed IPv4 inputs", () => {
    expect(normalizeIpAddress("999.1.1.1")).toBeUndefined();
    expect(normalizeIpAddress("192.168.one.1")).toBeUndefined();
    expect(normalizeIpAddress("192.168.1")).toBeUndefined();
  });

  it("returns undefined for malformed IPv6 inputs", () => {
    expect(normalizeIpAddress("2001:::1")).toBeUndefined();
    expect(normalizeIpAddress("2001:db8::1::2")).toBeUndefined();
    expect(normalizeIpAddress("2001:db8::zzzz")).toBeUndefined();
    expect(normalizeIpAddress("2001:db8:1:2:3:4:5:6:7")).toBeUndefined();
  });

  it("returns undefined for empty or missing values", () => {
    expect(normalizeIpAddress("")).toBeUndefined();
    expect(normalizeIpAddress("   ")).toBeUndefined();
    expect(normalizeIpAddress(undefined)).toBeUndefined();
    expect(normalizeIpAddress(null)).toBeUndefined();
  });
});
