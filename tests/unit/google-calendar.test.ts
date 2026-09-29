import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  backoffMinutes,
  buildEventBody,
  deleteEvent,
  eventIdFor,
  GoogleApiError,
  isTemporary,
  upsertEvent,
} from "@/server/google/calendar";
import { decryptToken, encryptToken } from "@/server/google/crypto";
import { emailFromIdToken, GoogleAuthError } from "@/server/google/oauth";

const MEETING = "8f14e45f-ceea-467a-9575-2fc1e3f0b6a1";
const input = {
  meetingId: MEETING,
  leadId: "37d2a087-f211-4129-b530-6ccde80cee6b",
  title: "Meeting with Sarah Mitchell (Smile Dental Austin)",
  startsAtUtc: "2026-10-06T15:00:00.000Z",
  durationMin: 30,
  timezone: "America/Chicago",
  location: "https://meet.google.com/abc",
  agenda: "Pricing and intake demo",
  reminders: [30, 10],
  company: "Smile Dental Austin",
  contact: { name: "Sarah Mitchell", email: "sarah@smile.example", phone: "+15125550100" },
  inviteContact: false,
  siteUrl: "https://bd-minimal.vercel.app",
};

describe("Google event body (docs/10 section 2)", () => {
  it("uses a stable base32hex id from the meeting", () => {
    expect(eventIdFor(MEETING)).toBe("8f14e45fceea467a95752fc1e3f0b6a1");
    expect(eventIdFor(MEETING)).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it("sends the exact time, zone, reminders and a link back to the lead", () => {
    const b = buildEventBody(input);
    expect(b.start).toEqual({ dateTime: "2026-10-06T15:00:00.000Z", timeZone: "America/Chicago" });
    expect(b.end).toEqual({ dateTime: "2026-10-06T15:30:00.000Z", timeZone: "America/Chicago" });
    expect(b.reminders).toEqual({
      useDefault: false,
      overrides: [
        { method: "popup", minutes: 30 },
        { method: "popup", minutes: 10 },
      ],
    });
    expect(b.description).toContain("Pricing and intake demo");
    expect(b.description).toContain("Sarah Mitchell · sarah@smile.example · +15125550100");
    expect(b.description).toContain("https://bd-minimal.vercel.app/leads/37d2a087-f211-4129-b530-6ccde80cee6b");
    expect(b.extendedProperties.private.caoMeetingId).toBe(MEETING);
  });

  it("invites the contact only when asked", () => {
    expect(buildEventBody(input).attendees).toBeUndefined();
    expect(buildEventBody({ ...input, inviteContact: true }).attendees).toEqual([
      { email: "sarah@smile.example", displayName: "Sarah Mitchell" },
    ]);
    expect(
      buildEventBody({ ...input, inviteContact: true, contact: { ...input.contact, email: null } }).attendees,
    ).toBeUndefined();
  });
});

describe("retries", () => {
  it("backs off 2, 4, 8 … minutes up to 6 hours", () => {
    expect([1, 2, 3, 4, 8, 12].map(backoffMinutes)).toEqual([2, 4, 8, 16, 256, 360]);
  });
  it("retries only temporary problems", () => {
    expect(isTemporary(new GoogleApiError(503, ""))).toBe(true);
    expect(isTemporary(new GoogleApiError(429, "rateLimitExceeded"))).toBe(true);
    expect(isTemporary(new GoogleApiError(403, "userRateLimitExceeded"))).toBe(true);
    expect(isTemporary(new GoogleApiError(403, "forbidden"))).toBe(false);
    expect(isTemporary(new GoogleApiError(400, "invalid"))).toBe(false);
    expect(isTemporary(new GoogleAuthError("invalid_grant"))).toBe(false);
    expect(isTemporary(new TypeError("fetch failed"))).toBe(true);
  });
});

describe("calendar calls (mocked Google)", () => {
  const calls: { method: string; url: string; body: unknown }[] = [];
  let replies: { status: number; json?: unknown }[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubEnv("GOOGLE_API_BASE", "https://google.test");
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ method: init.method ?? "GET", url, body: init.body ? JSON.parse(String(init.body)) : undefined });
      const r = replies.shift() ?? { status: 200, json: {} };
      return new Response(r.status === 204 ? null : JSON.stringify(r.json ?? {}), { status: r.status });
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const body = buildEventBody(input);

  it("inserts a new event with our id", async () => {
    replies = [{ status: 200, json: { id: body.id, status: "confirmed" } }];
    expect(await upsertEvent("tok", "primary", body, false)).toEqual({ eventId: body.id });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe("https://google.test/calendar/v3/calendars/primary/events?sendUpdates=none");
  });

  it("an id that already exists (a retry, or re-adding) is patched back to confirmed: never a duplicate", async () => {
    replies = [
      { status: 409, json: { error: { errors: [{ reason: "duplicate" }] } } },
      { status: 200, json: { status: "confirmed" } },
    ];
    expect(await upsertEvent("tok", "primary", body, false)).toEqual({ eventId: body.id });
    expect(calls.map((c) => c.method)).toEqual(["POST", "PATCH"]);
    expect((calls[1]!.body as { status: string }).status).toBe("confirmed");
  });

  it("an event the user deleted in Google is reported, not brought back", async () => {
    replies = [{ status: 200, json: { status: "cancelled" } }];
    expect(await upsertEvent("tok", "primary", body, true)).toEqual({ removedInGoogle: true });
    expect((calls[0]!.body as { status?: string }).status).toBeUndefined();
    replies = [{ status: 404, json: {} }];
    expect(await upsertEvent("tok", "primary", body, true)).toEqual({ removedInGoogle: true });
  });

  it("server errors surface for the retry logic", async () => {
    replies = [{ status: 503, json: { error: { status: "UNAVAILABLE" } } }];
    await expect(upsertEvent("tok", "primary", body, true)).rejects.toMatchObject({ status: 503 });
  });

  it("deleting something already gone is fine", async () => {
    replies = [{ status: 410 }];
    await expect(deleteEvent("tok", "primary", body.id)).resolves.toBeUndefined();
    replies = [{ status: 204 }];
    await expect(deleteEvent("tok", "primary", body.id)).resolves.toBeUndefined();
  });
});

describe("token encryption", () => {
  const key = randomBytes(32);
  it("round-trips and never stores the token in the clear", () => {
    const enc = encryptToken("1//refresh-token-value", key);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("refresh-token-value");
    expect(decryptToken(enc, key)).toBe("1//refresh-token-value");
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });
  it("detects tampering and the wrong key", () => {
    const enc = encryptToken("secret", key);
    const parts = enc.split(":");
    const flipped = [parts[0], parts[1], parts[2], Buffer.from("x" + parts[3]).toString("base64url")].join(":");
    expect(() => decryptToken(flipped, key)).toThrow();
    expect(() => decryptToken(enc, randomBytes(32))).toThrow();
  });
});

describe("id_token", () => {
  it("reads the email", () => {
    const payload = Buffer.from(JSON.stringify({ email: "ahmrazsal7@gmail.com" })).toString("base64url");
    expect(emailFromIdToken(`h.${payload}.s`)).toBe("ahmrazsal7@gmail.com");
    expect(emailFromIdToken("garbage")).toBeNull();
  });
});
