/**
 * A second demo office (docs/11): Northwind Legal, with its own founder, one BD and a few leads, activities and
 * one opportunity. It shows that offices are separate: BlueBugs never sees these rows, and they never see BlueBugs'.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";
import { PASSWORD, reserveMember } from "./target";

export const SECOND_OFFICE = {
  name: "Northwind Legal",
  timezone: "America/New_York",
  members: [
    { key: "nora", name: "Nora Hayes", email: "nora@northwind.example.com", role: "founder" as const },
    { key: "omar", name: "Omar Reid", email: "omar@northwind.example.com", role: "bd" as const },
  ],
};

const COMPANIES = [
  ["Hale & Porter LLP", "Boston", "MA"],
  ["Greene Family Law", "Hartford", "CT"],
  ["Summit Injury Lawyers", "Albany", "NY"],
  ["Beacon Estate Planning", "Providence", "RI"],
  ["Crest Immigration Law", "Newark", "NJ"],
  ["Ridge Criminal Defense", "Buffalo", "NY"],
];

function must<T>(res: { data: T; error: { message: string } | null }, what: string): NonNullable<T> {
  if (res.error || res.data == null) throw new Error(`${what}: ${res.error?.message ?? "no data"}`);
  return res.data as NonNullable<T>;
}

export async function seedSecondOffice(db: SupabaseClient<Database>) {
  const { name, timezone, members } = SECOND_OFFICE;
  const founder = members.find((m) => m.role === "founder")!;
  const officeId = must(
    await db.rpc("create_office", { p_name: name, p_timezone: timezone, p_seat_limit: 5, p_founder_email: founder.email }),
    "second office",
  );

  const ids: Record<string, string> = {};
  for (const m of members) {
    if (m.role !== "founder") await reserveMember(db, m.email, officeId, m.role);
    const created = await db.auth.admin.createUser({
      email: m.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: m.name },
    });
    if (created.error || !created.data.user) throw new Error(`user ${m.key}: ${created.error?.message}`);
    ids[m.key] = created.data.user.id;
  }

  const one = async (table: "niches" | "channels" | "activity_types", value: string) =>
    must(await db.from(table).select("id").eq("office_id", officeId).eq("name", value).single(), `${table} ${value}`).id;
  const law = await one("niches", "Law");
  const email = await one("channels", "Email");
  const coldEmail = await one("activity_types", "Cold email");
  const reply = await one("activity_types", "Reply received");
  await db.from("profiles").update({ primary_niche_id: law, timezone }).eq("id", ids.omar!);

  const leads = must(
    await db
      .from("leads")
      .insert(
        COMPANIES.map(([company, city, state], i) => ({
          owner_id: i % 3 === 0 ? ids.nora! : ids.omar!,
          created_by: i % 3 === 0 ? ids.nora! : ids.omar!,
          company_name: company!,
          website: `https://www.${company!.toLowerCase().replace(/[^a-z]+/g, "")}.com`,
          city,
          state_region: state,
          niche_id: law,
          channel_id: email,
          lead_timezone: timezone,
        })),
      )
      .select("id, owner_id, company_name"),
    "second office leads",
  );
  must(
    await db
      .from("contacts")
      .insert(leads.map((l, i) => ({ lead_id: l.id, first_name: ["Anna", "Ben", "Chloe", "Dev", "Ella", "Finn"][i]!, is_primary: true })))
      .select("id"),
    "second office contacts",
  );
  must(
    await db
      .from("activities")
      .insert(
        leads.flatMap((l, i) => [
          { lead_id: l.id, user_id: l.owner_id, activity_type_id: coldEmail, category: "outreach" as const, outcome_key: "no_response" },
          ...(i < 2
            ? [{ lead_id: l.id, user_id: l.owner_id, activity_type_id: reply, category: "inbound_reply" as const, outcome_key: "interested" }]
            : []),
        ]),
      )
      .select("id"),
    "second office activities",
  );
  const first = leads[0]!;
  must(
    await db
      .from("opportunities")
      .insert({ lead_id: first.id, owner_id: first.owner_id, created_by: first.owner_id, title: "Client intake website", estimated_value: 4200 })
      .select("id"),
    "second office opportunity",
  );

  return { name, officeId, members: members.map((m) => ({ email: m.email, role: m.role === "founder" ? "founder" : "BD" })) };
}
