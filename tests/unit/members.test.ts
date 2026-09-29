import { describe, expect, it } from "vitest";
import { inviteSchema, setMemberPasswordSchema } from "@/lib/validation/auth";

const ID = "00000000-0000-4000-8000-000000000001";
const errorsOf = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) =>
  Object.fromEntries((r.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));

describe("Add member with a password", () => {
  const base = { fullName: "Omar Farooq", email: "Omar@Example.com", role: "bd", primaryNicheId: ID, timezone: "Asia/Karachi" };

  it("defaults to setting a password, and needs one", () => {
    const r = inviteSchema.safeParse(base);
    expect(r.success).toBe(false);
    expect(errorsOf(r)).toEqual({ password: "Use at least 10 characters." });
  });

  it("needs at least 10 characters typed twice the same", () => {
    expect(errorsOf(inviteSchema.safeParse({ ...base, password: "short", confirm: "short" }))).toEqual({
      password: "Use at least 10 characters.",
    });
    expect(errorsOf(inviteSchema.safeParse({ ...base, password: "long-enough-1", confirm: "long-enough-2" }))).toEqual({
      confirm: "The passwords don't match.",
    });
    const ok = inviteSchema.safeParse({ ...base, password: "long-enough-1", confirm: "long-enough-1" });
    expect(ok.success).toBe(true);
    expect(ok.data).toMatchObject({ method: "password", email: "omar@example.com", password: "long-enough-1" });
  });

  it("doesn't ask for a password on the invite-email path", () => {
    expect(inviteSchema.safeParse({ ...base, method: "email" }).success).toBe(true);
    expect(inviteSchema.safeParse({ ...base, method: "sms" }).success).toBe(false);
  });
});

describe("Set password", () => {
  it("needs a member id and 10+ matching characters", () => {
    expect(setMemberPasswordSchema.safeParse({ id: ID, password: "new-pass-123", confirm: "new-pass-123" }).success).toBe(true);
    expect(errorsOf(setMemberPasswordSchema.safeParse({ id: ID, password: "short", confirm: "short" }))).toEqual({
      password: "Use at least 10 characters.",
    });
    expect(errorsOf(setMemberPasswordSchema.safeParse({ id: ID, password: "new-pass-123", confirm: "new-pass-124" }))).toEqual({
      confirm: "The passwords don't match.",
    });
    expect(setMemberPasswordSchema.safeParse({ id: "not-an-id", password: "new-pass-123", confirm: "new-pass-123" }).success).toBe(false);
  });
});
