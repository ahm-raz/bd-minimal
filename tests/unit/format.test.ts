import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneyCompact,
  formatPercent,
  formatPhone,
  formatRatio,
  formatScore,
  initials,
  possessive,
} from "@/lib/format";

describe("formatMoney", () => {
  it("drops zero cents", () => {
    expect(formatMoney(12000)).toBe("$12,000");
    expect(formatMoney("3500.00")).toBe("$3,500");
    expect(formatMoney(0)).toBe("$0");
  });
  it("keeps non-zero cents", () => {
    expect(formatMoney(12000.5)).toBe("$12,000.50");
    expect(formatMoney("99.99")).toBe("$99.99");
  });
  it("handles empty values", () => {
    expect(formatMoney(null)).toBe("–");
    expect(formatMoney(undefined)).toBe("–");
    expect(formatMoney("abc")).toBe("–");
  });
  it("compact", () => {
    expect(formatMoneyCompact(3500)).toBe("$3.5k");
    expect(formatMoneyCompact(12000)).toBe("$12k");
    expect(formatMoneyCompact(1_250_000)).toBe("$1.3M");
    expect(formatMoneyCompact(800)).toBe("$800");
  });
});

describe("formatPercent", () => {
  it("one decimal", () => {
    expect(formatPercent(9, 100)).toBe("9%");
    expect(formatPercent(69, 200)).toBe("34.5%");
    expect(formatPercent(1, 3)).toBe("33.3%");
    expect(formatPercent(2, 2)).toBe("100%");
  });
  it("shows a dash when the denominator is 0", () => {
    expect(formatPercent(0, 0)).toBe("–");
    expect(formatPercent(5, 0)).toBe("–");
  });
  it("ratio and score", () => {
    expect(formatRatio(0.345)).toBe("34.5%");
    expect(formatRatio(null)).toBe("–");
    expect(formatRatio(Number.NaN)).toBe("–");
    expect(formatScore(90)).toBe("90%");
  });
});

describe("formatPhone", () => {
  it("US numbers display nationally", () => {
    expect(formatPhone("+15125550100")).toBe("(512) 555-0100");
  });
  it("other numbers display internationally", () => {
    expect(formatPhone("+442079460958")).toBe("+44 20 7946 0958");
    expect(formatPhone("+923001234567")).toBe("+92 300 1234567");
  });
  it("empty and junk", () => {
    expect(formatPhone(null)).toBe("");
    expect(formatPhone("not a phone")).toBe("not a phone");
  });
});

describe("names", () => {
  it("initials", () => {
    expect(initials("Ahmed Khan")).toBe("AK");
    expect(initials("Zain")).toBe("ZA");
    expect(initials("  ")).toBe("?");
  });
  it("possessive", () => {
    expect(possessive("Ahmed")).toBe("Ahmed's");
    expect(possessive("James")).toBe("James'");
  });
});
