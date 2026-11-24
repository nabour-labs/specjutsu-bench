import { describe, expect, it } from "vitest";
import { formatCents, percentOf, toCents } from "../src/money.ts";

describe("toCents", () => {
  it("converts a decimal amount to cents", () => {
    expect(toCents(12.34)).toBe(1234);
  });

  it("rounds away floating-point noise", () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
  });
});

describe("percentOf", () => {
  it("rounds to the nearest cent", () => {
    expect(percentOf(999, 8.25)).toBe(82);
    expect(percentOf(1000, 5)).toBe(50);
  });
});

describe("formatCents", () => {
  it("formats dollars with thousands separators", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
  });

  it("pads single-digit cents", () => {
    expect(formatCents(5)).toBe("$0.05");
  });

  it("puts the sign before the dollar sign", () => {
    expect(formatCents(-50)).toBe("-$0.50");
  });
});
