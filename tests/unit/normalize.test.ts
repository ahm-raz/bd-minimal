import { describe, expect, it } from "vitest";
import {
  countryCode,
  domainOf,
  normalizeCompanyLinkedIn,
  normalizeContactLinkedIn,
  normalizeCount,
  normalizeEmail,
  normalizeMapsUrl,
  normalizeOtherUrl,
  normalizePhone,
  normalizeRating,
  normalizeTags,
  normalizeUpworkUrl,
  normalizeWebsite,
  splitPastedName,
  suggestTimezone,
} from "@/lib/validation/normalize";

const value = (r: { ok: boolean; value?: unknown }) => (r.ok ? r.value : "ERROR");

describe("normalizeWebsite", () => {
  it.each([
    ["brightsmile.com", "https://brightsmile.com"],
    ["  BrightSmile.COM  ", "https://brightsmile.com"],
    ["http://www.BrightSmile.com/about?x=1", "http://www.brightsmile.com/about?x=1"],
    ["https://brightsmile.com/", "https://brightsmile.com"],
    ["www.brightsmile.co.uk/team", "https://www.brightsmile.co.uk/team"],
  ])("%s → %s", (raw, out) => expect(value(normalizeWebsite(raw))).toBe(out));

  it.each([["brightsmile"], ["not a url"], ["ftp://brightsmile.com"], ["https://"], ["localhost"], ["brightsmile."]])(
    "rejects %s",
    (raw) => {
      const r = normalizeWebsite(raw);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("Enter a website like brightsmile.com.");
    },
  );

  it("empty is null", () => {
    expect(value(normalizeWebsite(""))).toBeNull();
    expect(value(normalizeWebsite("   "))).toBeNull();
    expect(value(normalizeWebsite(null))).toBeNull();
    expect(value(normalizeWebsite(undefined))).toBeNull();
  });
});

describe("domainOf (mirrors the SQL trigger)", () => {
  it.each([
    ["https://www.BrightSmile.com/about", "brightsmile.com"],
    ["https://www.Clinic1.com/about?x=1", "clinic1.com"],
    ["brightsmile.com#top", "brightsmile.com"],
    ["http://sub.example.org?q=1", "sub.example.org"],
  ])("%s → %s", (raw, out) => expect(domainOf(raw)).toBe(out));
  it("blank → null", () => expect(domainOf(" ")).toBeNull());
});

describe("LinkedIn", () => {
  it.each([
    ["linkedin.com/company/bright-smile/", "https://www.linkedin.com/company/bright-smile"],
    ["https://www.linkedin.com/company/bright-smile/about/?viewAsMember=true", "https://www.linkedin.com/company/bright-smile"],
    ["http://uk.linkedin.com/company/acme", "https://www.linkedin.com/company/acme"],
    ["https://www.linkedin.com/school/ut-austin/", "https://www.linkedin.com/school/ut-austin"],
  ])("company %s → %s", (raw, out) => expect(value(normalizeCompanyLinkedIn(raw))).toBe(out));

  it.each([["https://www.linkedin.com/in/maria"], ["https://example.com/company/x"], ["linkedin.com/company/"], ["garbage"]])(
    "company rejects %s",
    (raw) => expect(normalizeCompanyLinkedIn(raw).ok).toBe(false),
  );

  it.each([
    ["linkedin.com/in/maria-lopez", "https://www.linkedin.com/in/maria-lopez"],
    ["https://www.linkedin.com/in/maria-lopez/?utm_source=share", "https://www.linkedin.com/in/maria-lopez"],
    ["HTTPS://WWW.LINKEDIN.COM/IN/MariaLopez", "https://www.linkedin.com/in/MariaLopez"],
  ])("contact %s → %s", (raw, out) => expect(value(normalizeContactLinkedIn(raw))).toBe(out));

  it.each([["https://www.linkedin.com/company/acme"], ["https://www.linkedin.com/in/"], ["https://notlinkedin.com/in/x"]])(
    "contact rejects %s",
    (raw) => expect(normalizeContactLinkedIn(raw).ok).toBe(false),
  );

  it("empty is null", () => {
    expect(value(normalizeContactLinkedIn(""))).toBeNull();
    expect(value(normalizeCompanyLinkedIn(null))).toBeNull();
  });
});

describe("normalizeEmail", () => {
  it.each([
    [" Maria@BrightSmile.com ", "maria@brightsmile.com"],
    ["a.b+tag@sub.example.co", "a.b+tag@sub.example.co"],
  ])("%s → %s", (raw, out) => expect(value(normalizeEmail(raw))).toBe(out));
  it.each([["maria"], ["maria@"], ["@x.com"], ["maria@x"], ["ma ria@x.com"], ["maria@x..com"], ["maria@x.c"]])(
    "rejects %s",
    (raw) => expect(normalizeEmail(raw).ok).toBe(false),
  );
  it("empty is null", () => expect(value(normalizeEmail(""))).toBeNull());
});

describe("normalizePhone", () => {
  it("defaults to the US", () => {
    expect(value(normalizePhone("512 555 0100"))).toBe("+15125550100");
    expect(value(normalizePhone("512 555 0100", "United States"))).toBe("+15125550100");
    expect(value(normalizePhone("(512) 555-0100", ""))).toBe("+15125550100");
    expect(value(normalizePhone("+1 512-555-0100", "United States"))).toBe("+15125550100");
  });
  it("uses the lead's country", () => {
    expect(value(normalizePhone("020 7946 0958", "United Kingdom"))).toBe("+442079460958");
    expect(value(normalizePhone("0300 1234567", "Pakistan"))).toBe("+923001234567");
  });
  it("an international number works with any default country", () => {
    expect(value(normalizePhone("+44 20 7946 0958", "United States"))).toBe("+442079460958");
  });
  it("keeps any other format as typed (every format is allowed)", () => {
    expect(normalizePhone("555 0100", "United States")).toEqual({ ok: true, value: "555 0100" });
    expect(normalizePhone("  555   123 4567 ", "United States")).toEqual({ ok: true, value: "555 123 4567" });
    expect(normalizePhone("ext. 204, front desk", "United States")).toEqual({ ok: true, value: "ext. 204, front desk" });
  });
  it("empty is null", () => expect(value(normalizePhone("  "))).toBeNull());
  it("maps country names", () => {
    expect(countryCode("United States")).toBe("US");
    expect(countryCode("usa")).toBe("US");
    expect(countryCode("Germany")).toBe("DE");
    expect(countryCode("Atlantis")).toBe("US");
    expect(countryCode(null)).toBe("US");
  });
});

describe("maps, upwork, other URLs", () => {
  it.each([
    ["maps.app.goo.gl/abc123"],
    ["https://www.google.com/maps/place/Bright+Smile"],
    ["https://goo.gl/maps/xyz"],
    ["https://maps.google.co.uk/?q=x"],
  ])("maps accepts %s", (raw) => expect(normalizeMapsUrl(raw).ok).toBe(true));
  it.each([["https://bing.com/maps"], ["https://notgoogle.example/maps"], ["maps"]])("maps rejects %s", (raw) =>
    expect(normalizeMapsUrl(raw).ok).toBe(false),
  );
  it("maps adds https", () => expect(value(normalizeMapsUrl("maps.app.goo.gl/abc"))).toBe("https://maps.app.goo.gl/abc"));

  it.each([["upwork.com/jobs/~0123"], ["https://www.upwork.com/freelance-jobs/apply/x"]])("upwork accepts %s", (raw) =>
    expect(normalizeUpworkUrl(raw).ok).toBe(true),
  );
  it.each([["https://upwork.co/jobs/x"], ["https://fakeupwork.com.evil.io/jobs"], ["https://notupwork.com/jobs"]])(
    "upwork rejects %s",
    (raw) => expect(normalizeUpworkUrl(raw).ok).toBe(false),
  );

  it("other social", () => {
    expect(value(normalizeOtherUrl("x.com/mariadds"))).toBe("https://x.com/mariadds");
    expect(normalizeOtherUrl("nope").ok).toBe(false);
  });
});

describe("tags, rating, count", () => {
  it("tags are trimmed, lowercased and deduped", () => {
    expect(value(normalizeTags([" Texas ", "texas", "PEDIATRIC", ""]))).toEqual(["texas", "pediatric"]);
    expect(value(normalizeTags("a, b ,A"))).toEqual(["a", "b"]);
    expect(value(normalizeTags(null))).toEqual([]);
  });
  it("tags have limits", () => {
    expect(normalizeTags(Array.from({ length: 11 }, (_, i) => `t${i}`)).ok).toBe(false);
    expect(normalizeTags(["x".repeat(31)]).ok).toBe(false);
    expect(normalizeTags(["x".repeat(30)]).ok).toBe(true);
  });
  it("rating: one decimal, 0–5", () => {
    expect(value(normalizeRating("4.66"))).toBe(4.7);
    expect(value(normalizeRating("4,5"))).toBe(4.5);
    expect(value(normalizeRating(0))).toBe(0);
    expect(value(normalizeRating(""))).toBeNull();
    expect(normalizeRating("5.1").ok).toBe(false);
    expect(normalizeRating("-1").ok).toBe(false);
    expect(normalizeRating("abc").ok).toBe(false);
  });
  it("review count: whole number ≥ 0", () => {
    expect(value(normalizeCount("212"))).toBe(212);
    expect(value(normalizeCount("1,204"))).toBe(1204);
    expect(value(normalizeCount(""))).toBeNull();
    expect(normalizeCount("2.5").ok).toBe(false);
    expect(normalizeCount("-3").ok).toBe(false);
  });
});

describe("suggestTimezone", () => {
  it.each([
    ["TX", "America/Chicago"],
    ["tx", "America/Chicago"],
    ["Texas", "America/Chicago"],
    ["CA", "America/Los_Angeles"],
    ["New York", "America/New_York"],
    ["AZ", "America/Phoenix"],
  ])("%s → %s", (state, tz) => expect(suggestTimezone(state)).toBe(tz));
  it("unknown or non-US is null", () => {
    expect(suggestTimezone("Narnia")).toBeNull();
    expect(suggestTimezone("")).toBeNull();
    expect(suggestTimezone("TX", "Germany")).toBeNull();
  });
});

describe("splitPastedName", () => {
  it("moves LinkedIn URLs", () => {
    expect(splitPastedName("https://www.linkedin.com/in/maria-lopez/")).toEqual({
      linkedin: "https://www.linkedin.com/in/maria-lopez/",
    });
  });
  it("splits First Last", () => {
    expect(splitPastedName("Maria Lopez")).toEqual({ first: "Maria", last: "Lopez" });
    expect(splitPastedName("Maria de la Cruz")).toEqual({ first: "Maria", last: "de la Cruz" });
    expect(splitPastedName("Dr. Maria Lopez")).toEqual({ first: "Dr. Maria", last: "Lopez" });
  });
  it("leaves single names alone", () => expect(splitPastedName(" Maria ")).toEqual({ first: "Maria" }));
});
