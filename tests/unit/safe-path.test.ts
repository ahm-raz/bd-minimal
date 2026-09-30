import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safe-path";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/leads")).toBe("/leads");
    expect(safeNextPath("/leads/123?view=all#top")).toBe("/leads/123?view=all#top");
    expect(safeNextPath("/")).toBe("/");
  });

  it("falls back for missing or non-string values", () => {
    expect(safeNextPath(undefined)).toBe("/my-day");
    expect(safeNextPath(null)).toBe("/my-day");
    expect(safeNextPath(["/leads"])).toBe("/my-day");
    expect(safeNextPath("")).toBe("/my-day");
    expect(safeNextPath(undefined, "/tasks")).toBe("/tasks");
  });

  it("rejects other origins", () => {
    for (const bad of [
      "//evil.com",
      "/\\evil.com",
      "\\\\evil.com",
      "/\\/evil.com",
      "https://evil.com",
      "evil.com",
      "javascript:alert(1)",
      "/\tevil.com",
      "/\n/evil.com",
      "/%0a",
      " /leads",
    ]) {
      const out = safeNextPath(bad);
      expect(new URL(out, "http://x").origin, bad).toBe("http://x");
      if (bad !== "/%0a") expect(out, bad).toBe("/my-day");
    }
  });

  it("rejects control characters", () => {
    expect(safeNextPath("/leads\u0000")).toBe("/my-day");
    expect(safeNextPath("/leads\u007f")).toBe("/my-day");
  });
});
