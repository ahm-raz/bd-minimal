import { describe, expect, it } from "vitest";
import { createOfficeSchema, officeEditSchema, officeSettingsSchema } from "@/lib/validation/offices";
import { setupSchema } from "@/lib/validation/auth";

const ID = "00000000-0000-4000-8000-000000000001";

describe("office schemas (docs/11)", () => {
  it("seats: empty, blank or null mean no limit; whole numbers 1 to 1000 are kept", () => {
    for (const v of ["", "  ", null]) expect(officeEditSchema.parse({ id: ID, name: "A", seatLimit: v }).seatLimit).toBeNull();
    expect(officeEditSchema.parse({ id: ID, name: "A", seatLimit: "5" }).seatLimit).toBe(5);
    expect(officeEditSchema.parse({ id: ID, name: "A", seatLimit: 1000 }).seatLimit).toBe(1000);
  });

  it("seats: zero, negatives, fractions, words and over 1000 are refused", () => {
    for (const v of ["0", "-2", "2.5", "ten", "1001"]) {
      const r = officeEditSchema.safeParse({ id: ID, name: "A", seatLimit: v });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]!.message).toBe("Enter a whole number from 1 to 1000, or leave it empty for no limit.");
    }
  });

  it("office name is trimmed, required and at most 80 characters", () => {
    expect(officeSettingsSchema.parse({ name: "  Beta Group ", timezone: "Europe/Berlin" }).name).toBe("Beta Group");
    expect(officeSettingsSchema.safeParse({ name: "   ", timezone: "Europe/Berlin" }).success).toBe(false);
    expect(officeSettingsSchema.safeParse({ name: "x".repeat(81), timezone: "Europe/Berlin" }).success).toBe(false);
    expect(officeSettingsSchema.safeParse({ name: "Beta", timezone: "Mars/Olympus" }).success).toBe(false);
  });

  it("create office needs the founder's password typed twice, unless an invite email is sent", () => {
    const base = { name: "Beta", timezone: "UTC", seatLimit: "", founderName: "Omar", founderEmail: "OMAR@Y.com " };
    const ok = createOfficeSchema.parse({ ...base, password: "long-enough-1", confirm: "long-enough-1" });
    expect(ok.founderEmail).toBe("omar@y.com");
    expect(ok.method).toBe("password");
    const mismatch = createOfficeSchema.safeParse({ ...base, password: "long-enough-1", confirm: "long-enough-2" });
    expect(mismatch.success).toBe(false);
    expect(createOfficeSchema.safeParse({ ...base, password: "short", confirm: "short" }).success).toBe(false);
    expect(createOfficeSchema.safeParse({ ...base, method: "email" }).success).toBe(true);
  });

  it("setup asks for the office name", () => {
    const r = setupSchema.safeParse({ fullName: "Zain", email: "z@x.com", password: "long-enough-1", timezone: "UTC", officeName: "" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.map((i) => i.path[0])).toContain("officeName");
  });
});
