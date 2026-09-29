import { describe, expect, it } from "vitest";
import { parseLeadField } from "@/lib/validation/lead-field";

const ID = "00000000-0000-4000-8000-000000000001";

describe("parseLeadField (Details panel, edit in place)", () => {
  it("cleans values the same way as the lead form", () => {
    expect(parseLeadField("website", "  BrightSmile.com ")).toEqual({ ok: true, value: "https://brightsmile.com" });
    expect(parseLeadField("company_linkedin_url", "linkedin.com/company/bright-smile")).toEqual({
      ok: true,
      value: "https://www.linkedin.com/company/bright-smile",
    });
    expect(parseLeadField("company_phone", "512 555 0100", "United States")).toEqual({ ok: true, value: "+15125550100" });
    expect(parseLeadField("company_phone", "555 123 4567", "United States")).toEqual({ ok: true, value: "555 123 4567" });
    expect(parseLeadField("company_email", "Info@Bright.com")).toEqual({ ok: true, value: "info@bright.com" });
    expect(parseLeadField("google_rating", "4.73")).toEqual({ ok: true, value: 4.7 });
    expect(parseLeadField("tags", ["Austin", "austin", "family"])).toEqual({ ok: true, value: ["austin", "family"] });
  });

  it("empty clears optional fields", () => {
    expect(parseLeadField("sub_niche", "   ")).toEqual({ ok: true, value: null });
    expect(parseLeadField("source_id", "")).toEqual({ ok: true, value: null });
    expect(parseLeadField("lead_timezone", "")).toEqual({ ok: true, value: null });
    expect(parseLeadField("country", "")).toEqual({ ok: true, value: "United States" });
  });

  it("shows the same errors as the form", () => {
    expect(parseLeadField("website", "not a site")).toEqual({ ok: false, error: "Enter a website like brightsmile.com." });
    expect(parseLeadField("google_rating", "7")).toEqual({ ok: false, error: "Use a rating from 0.0 to 5.0." });
    expect(parseLeadField("google_review_count", "-1")).toEqual({ ok: false, error: "Use a whole number, 0 or more." });
    expect(parseLeadField("lead_timezone", "Mars/Olympus")).toEqual({ ok: false, error: "Pick a time zone from the list." });
    expect(parseLeadField("company_size", "huge")).toEqual({ ok: false, error: "Pick a company size." });
    expect(parseLeadField("pain_point", "x".repeat(1001))).toEqual({ ok: false, error: "Keep the pain point under 1000 characters." });
  });

  it("niche and channel are required", () => {
    expect(parseLeadField("niche_id", "")).toEqual({ ok: false, error: "Pick a niche." });
    expect(parseLeadField("channel_id", "")).toEqual({ ok: false, error: "Pick a channel." });
    expect(parseLeadField("niche_id", ID)).toEqual({ ok: true, value: ID });
  });
});
