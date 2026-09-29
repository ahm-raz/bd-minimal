import { describe, expect, it } from "vitest";
import { emptyContact, makeLeadSchema, REACH_ERROR, REACH_ERROR_UPWORK, type LeadFormValues } from "@/lib/validation/lead";

const NICHE = "11111111-1111-4111-8111-111111111111";
const LINKEDIN = "22222222-2222-4222-8222-222222222222";
const UPWORK = "33333333-3333-4333-8333-333333333333";
const schema = makeLeadSchema({ upworkChannelId: UPWORK });

function lead(overrides: Partial<LeadFormValues> = {}, contact: Partial<ReturnType<typeof emptyContact>> = {}): LeadFormValues {
  return {
    company_name: "Bright Smile Dental",
    niche_id: NICHE,
    channel_id: LINKEDIN,
    contacts: [{ ...emptyContact(true), first_name: "Maria", ...contact }],
    ...overrides,
  };
}

function errorsOf(input: LeadFormValues) {
  const r = schema.safeParse(input);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("lead schema: required fields", () => {
  it("a lead with only name, niche, channel, first name and LinkedIn saves", () => {
    const r = schema.safeParse(lead({}, { linkedin_url: "linkedin.com/in/maria-lopez/" }));
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contacts[0]!.linkedin_url).toBe("https://www.linkedin.com/in/maria-lopez");
      expect(r.data.contacts[0]!.is_primary).toBe(true);
      expect(r.data.country).toBe("United States");
      expect(r.data.website).toBeNull();
    }
  });

  it("a lead without any contact method doesn't save", () => {
    expect(errorsOf(lead())).toEqual({ reach: REACH_ERROR });
  });

  it("company name 2–120 characters, trimmed", () => {
    expect(errorsOf(lead({ company_name: " B " }, { email: "m@b.com" }))).toHaveProperty("company_name");
    expect(errorsOf(lead({ company_name: "x".repeat(121) }, { email: "m@b.com" }))).toHaveProperty("company_name");
    const r = schema.safeParse(lead({ company_name: "  Bright Smile  " }, { email: "m@b.com" }));
    expect(r.success && r.data.company_name).toBe("Bright Smile");
  });

  it("niche, channel and first name are required", () => {
    const e = errorsOf({ ...lead({ niche_id: "", channel_id: "" }, { first_name: " ", email: "m@b.com" }) });
    expect(e.niche_id).toBe("Pick a niche.");
    expect(e.channel_id).toBe("Pick a channel.");
    expect(e["contacts.0.first_name"]).toBe("Enter a first name.");
  });
});

describe("lead schema: one way to reach them", () => {
  it.each([
    ["contact email", {}, { email: "maria@brightsmile.com" }],
    ["contact phone", {}, { phone: "512 555 0100" }],
    ["contact mobile", {}, { mobile_phone: "512 555 0101" }],
    ["contact LinkedIn", {}, { linkedin_url: "linkedin.com/in/maria" }],
    ["company phone", { company_phone: "512 555 0100" }, {}],
  ] as const)("%s counts", (_, l, c) => {
    expect(schema.safeParse(lead(l, c)).success).toBe(true);
  });

  it("a second contact's email counts", () => {
    const v = lead();
    v.contacts.push({ ...emptyContact(), first_name: "Jenna", email: "jenna@brightsmile.com" });
    expect(schema.safeParse(v).success).toBe(true);
  });

  it("an Upwork job URL counts when the channel is Upwork", () => {
    expect(schema.safeParse(lead({ channel_id: UPWORK, upwork_job_url: "upwork.com/jobs/~01" })).success).toBe(true);
  });

  it("an Upwork job URL doesn't count for other channels", () => {
    expect(errorsOf(lead({ upwork_job_url: "upwork.com/jobs/~01" }))).toEqual({ reach: REACH_ERROR });
  });

  it("Upwork channel with nothing says so", () => {
    expect(errorsOf(lead({ channel_id: UPWORK }))).toEqual({ reach: REACH_ERROR_UPWORK });
  });

  it("company email alone doesn't count", () => {
    expect(errorsOf(lead({ company_email: "info@brightsmile.com" }))).toEqual({ reach: REACH_ERROR });
  });
});

describe("lead schema: clean-up", () => {
  it("phone 512 555 0100 with country US is stored as +15125550100", () => {
    const r = schema.safeParse(lead({ country: "United States" }, { phone: "512 555 0100" }));
    expect(r.success && r.data.contacts[0]!.phone).toBe("+15125550100");
  });

  it("phones use the lead's country", () => {
    const r = schema.safeParse(lead({ country: "United Kingdom" }, { phone: "020 7946 0958" }));
    expect(r.success && r.data.contacts[0]!.phone).toBe("+442079460958");
  });

  it("bad values show field errors", () => {
    const e = errorsOf(
      lead(
        {
          website: "not a site",
          company_linkedin_url: "linkedin.com/in/maria",
          google_maps_url: "bing.com/maps",
          google_rating: "7",
          google_review_count: "-1",
          lead_timezone: "Mars/Olympus",
          tags: Array.from({ length: 11 }, (_, i) => `t${i}`),
        },
        { email: "maria@", phone: "555", linkedin_url: "linkedin.com/company/x" },
      ),
    );
    expect(Object.keys(e).sort()).toEqual(
      [
        "website",
        "company_linkedin_url",
        "google_maps_url",
        "google_rating",
        "google_review_count",
        "lead_timezone",
        "tags",
        "contacts.0.email",
        "contacts.0.linkedin_url",
      ].sort(),
    );
  });

  it("any phone format saves; unrecognised numbers are kept as typed", () => {
    const r = schema.safeParse(lead({}, { phone: "555 123 4567", mobile_phone: "512 555 0100" }));
    expect(r.success && r.data.contacts[0]!.phone).toBe("555 123 4567");
    expect(r.success && r.data.contacts[0]!.mobile_phone).toBe("+15125550100");
  });

  it("cleans every field", () => {
    const r = schema.safeParse(
      lead(
        {
          website: "BrightSmile.com",
          company_linkedin_url: "https://www.linkedin.com/company/bright-smile/?x=1",
          google_rating: "4.66",
          google_review_count: "212",
          tags: [" Texas", "texas", "PEDS"],
          city: " Austin ",
          sub_niche: "",
          next_action: "Send DM",
          next_action_due: "2026-09-30",
        },
        { email: " Maria@BrightSmile.com " },
      ),
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data).toMatchObject({
      website: "https://brightsmile.com",
      company_linkedin_url: "https://www.linkedin.com/company/bright-smile",
      google_rating: 4.7,
      google_review_count: 212,
      tags: ["texas", "peds"],
      city: "Austin",
      sub_niche: null,
      next_action: "Send DM",
      next_action_due: "2026-09-30",
    });
    expect(r.data.contacts[0]!.email).toBe("maria@brightsmile.com");
  });

  it("next action needs both text and date", () => {
    expect(errorsOf(lead({ next_action: "Send DM" }, { email: "m@b.com" }))).toHaveProperty("next_action_due");
    expect(errorsOf(lead({ next_action_due: "2026-09-30" }, { email: "m@b.com" }))).toHaveProperty("next_action");
  });

  it("exactly one primary contact", () => {
    const v = lead({}, { email: "m@b.com", is_primary: false });
    v.contacts.push({ ...emptyContact(), first_name: "Jenna" });
    let r = schema.safeParse(v);
    expect(r.success && r.data.contacts.map((c) => c.is_primary)).toEqual([true, false]);

    v.contacts[0]!.is_primary = true;
    v.contacts[1]!.is_primary = true;
    r = schema.safeParse(v);
    expect(r.success && r.data.contacts.map((c) => c.is_primary)).toEqual([true, false]);
  });

  it("allows up to 10 contacts", () => {
    const v = lead({}, { email: "m@b.com" });
    for (let i = 0; i < 10; i++) v.contacts.push({ ...emptyContact(), first_name: `C${i}` });
    expect(errorsOf(v)).toHaveProperty("contacts");
  });
});
