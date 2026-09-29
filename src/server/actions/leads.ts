"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { LEAD_STATUSES, LEAD_STATUS_LABELS, PRIORITIES, type LeadStatus } from "@/lib/domain";
import { domainOf, normalizeContactLinkedIn, normalizeEmail, normalizeTags } from "@/lib/validation/normalize";
import {
  makeContactSchema,
  makeLeadSchema,
  nextActionSchema,
  REACH_ERROR,
  type ContactFormValues,
  type LeadContactData,
  type LeadFormValues,
  type NextActionInput,
} from "@/lib/validation/lead";
import { LEAD_FIELDS, parseLeadField, type LeadField } from "@/lib/validation/lead-field";
import { FOUNDER_ONLY, getViewer, requireFounder } from "@/server/auth";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function upworkChannelId(supabase: Supabase): Promise<string | null> {
  const { data } = await supabase.from("channels").select("id").ilike("name", "upwork").maybeSingle();
  return data?.id ?? null;
}

function contactRow(c: LeadContactData, leadId: string) {
  return {
    lead_id: leadId,
    first_name: c.first_name,
    last_name: c.last_name,
    job_title: c.job_title,
    is_decision_maker: c.is_decision_maker,
    is_primary: c.is_primary,
    email: c.email,
    email_status: c.email_status,
    secondary_email: c.secondary_email,
    phone: c.phone,
    mobile_phone: c.mobile_phone,
    linkedin_url: c.linkedin_url,
    other_social_url: c.other_social_url,
    preferred_channel_id: c.preferred_channel_id,
    notes: c.notes,
  };
}

function revalidateLead(id?: string) {
  revalidatePath("/leads");
  revalidatePath("/my-day");
  if (id) revalidatePath(`/leads/${id}`);
}

/** Add lead (docs/07 section 4). The lead and its contacts are saved as the signed-in user. */
export async function createLead(input: LeadFormValues): Promise<ActionResult<{ id: string }>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Your session has ended. Sign in again.");
  const supabase = await createClient();
  const parsed = parseInput(makeLeadSchema({ upworkChannelId: await upworkChannelId(supabase) }), input);
  if (!parsed.ok) return parsed;
  const { contacts, id: _id, owner_id, ...lead } = parsed.data;
  void _id;

  const owner = viewer.role === "founder" && owner_id ? owner_id : viewer.id;
  const { data, error } = await supabase
    .from("leads")
    .insert({ ...lead, owner_id: owner, created_by: viewer.id })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error, "The lead wasn't saved. Try again."));

  const { error: cErr } = await supabase.from("contacts").insert(contacts.map((c) => contactRow(c, data.id)));
  if (cErr) {
    revalidateLead(data.id);
    return fail("The lead was saved, but its contacts weren't. Open the lead and add them again.");
  }
  revalidateLead(data.id);
  return ok({ id: data.id });
}

/** Edit lead: updates fields and syncs contacts (add, change, remove). */
export async function updateLead(input: LeadFormValues): Promise<ActionResult<{ id: string }>> {
  const viewer = await getViewer();
  if (!viewer) return fail("Your session has ended. Sign in again.");
  const supabase = await createClient();
  const parsed = parseInput(makeLeadSchema({ upworkChannelId: await upworkChannelId(supabase) }), input);
  if (!parsed.ok) return parsed;
  const { contacts, id, owner_id, ...lead } = parsed.data;
  if (!id) return fail("That lead wasn't found.");

  const update: typeof lead & { owner_id?: string } = { ...lead };
  if (viewer.role === "founder" && owner_id) update.owner_id = owner_id;
  const { data: updated, error } = await supabase.from("leads").update(update).eq("id", id).select("id");
  if (error) return fail(dbErrorMessage(error, "The lead wasn't saved. Try again."));
  if (!updated.length) return fail("That lead wasn't found.");

  const { data: existing } = await supabase.from("contacts").select("id").eq("lead_id", id);
  const keep = new Set(contacts.filter((c) => c.id).map((c) => c.id!));
  const remove = (existing ?? []).filter((c) => !keep.has(c.id)).map((c) => c.id);

  // One primary at a time (unique index): clear first, then write.
  await supabase.from("contacts").update({ is_primary: false }).eq("lead_id", id).eq("is_primary", true);
  if (remove.length) {
    const { error: dErr } = await supabase.from("contacts").delete().in("id", remove);
    if (dErr) return fail(dbErrorMessage(dErr, "A removed contact couldn't be deleted. Try again."));
  }
  const ordered = [...contacts].sort((a, b) => Number(a.is_primary) - Number(b.is_primary));
  for (const c of ordered) {
    const row = contactRow(c, id);
    const res = c.id
      ? await supabase.from("contacts").update(row).eq("id", c.id).eq("lead_id", id)
      : await supabase.from("contacts").insert(row);
    if (res.error) return fail(dbErrorMessage(res.error, "A contact wasn't saved. Try again."));
  }
  revalidateLead(id);
  return ok({ id });
}

const duplicateSchema = z.object({
  companyName: z.string().trim().max(200).optional().default(""),
  website: z.string().trim().max(300).optional().default(""),
  emails: z.array(z.string()).max(30).optional().default([]),
  linkedins: z.array(z.string()).max(30).optional().default([]),
  excludeId: z.string().optional().nullable(),
});

export type DuplicateMatch = { id: string; company_name: string; status: LeadStatus; statusLabel: string; reason: string };

/**
 * Duplicate notice (docs/04 section 1): only the caller's OWN leads are checked.
 * RLS already hides other BDs' leads; the owner filter also keeps the founder's check to their own.
 */
export async function findDuplicates(input: z.input<typeof duplicateSchema>): Promise<ActionResult<DuplicateMatch[]>> {
  const viewer = await getViewer();
  if (!viewer) return ok([]);
  const parsed = duplicateSchema.safeParse(input);
  if (!parsed.success) return ok([]);
  const { companyName, website, emails, linkedins, excludeId } = parsed.data;
  const supabase = await createClient();
  const found = new Map<string, DuplicateMatch>();
  const add = (rows: { id: string; company_name: string; status: LeadStatus }[] | null, reason: string) => {
    for (const r of rows ?? []) {
      if (r.id === excludeId || found.has(r.id)) continue;
      found.set(r.id, { ...r, statusLabel: LEAD_STATUS_LABELS[r.status], reason });
    }
  };

  const domain = domainOf(website);
  if (domain) {
    const { data } = await supabase.from("leads").select("id, company_name, status").eq("owner_id", viewer.id).eq("domain", domain).limit(5);
    add(data, "same website");
  }
  if (companyName.length >= 2) {
    const escaped = companyName.replace(/[%_\\]/g, (m) => `\\${m}`);
    const { data } = await supabase.from("leads").select("id, company_name, status").eq("owner_id", viewer.id).ilike("company_name", escaped).limit(5);
    add(data, "same company name");
  }
  const cleanEmails = emails.map((e) => normalizeEmail(e)).flatMap((r) => (r.ok && r.value ? [r.value] : []));
  const cleanLinkedIns = linkedins.map((l) => normalizeContactLinkedIn(l)).flatMap((r) => (r.ok && r.value ? [r.value] : []));
  if (cleanEmails.length || cleanLinkedIns.length) {
    const filters = [
      ...cleanEmails.map((e) => `email.eq.${e}`),
      ...cleanLinkedIns.map((l) => `linkedin_url.eq.${l}`),
    ].join(",");
    const { data } = await supabase
      .from("contacts")
      .select("lead_id, leads!inner(id, company_name, status, owner_id)")
      .or(filters)
      .eq("leads.owner_id", viewer.id)
      .limit(5);
    add(
      (data ?? []).map((r) => ({ id: r.leads.id, company_name: r.leads.company_name, status: r.leads.status })),
      "same contact",
    );
  }
  return ok([...found.values()]);
}

const statusSchema = z.object({ leadId: z.uuid(), status: z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]]) });

/** Manual status change (docs/04 section 2: a BD can always set any status by hand). */
export async function setLeadStatus(input: { leadId: string; status: LeadStatus }): Promise<ActionResult> {
  const parsed = parseInput(statusSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").update({ status: parsed.data.status }).eq("id", parsed.data.leadId).select("id");
  if (error) return fail(dbErrorMessage(error, "The status wasn't changed. Try again."));
  if (!data.length) return fail("That lead wasn't found.");
  revalidateLead(parsed.data.leadId);
  return ok();
}

const prioritySchema = z.object({ leadId: z.uuid(), priority: z.enum(PRIORITIES as ["high", "medium", "low"]) });

export async function setLeadPriority(input: { leadId: string; priority: "high" | "medium" | "low" }): Promise<ActionResult> {
  const parsed = parseInput(prioritySchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").update({ priority: parsed.data.priority }).eq("id", parsed.data.leadId).select("id");
  if (error) return fail(dbErrorMessage(error, "The priority wasn't changed. Try again."));
  if (!data.length) return fail("That lead wasn't found.");
  revalidateLead(parsed.data.leadId);
  return ok();
}

/** Next action box on the lead page. Clearing both fields removes the next action. */
export async function updateNextAction(input: NextActionInput): Promise<ActionResult> {
  const parsed = parseInput(nextActionSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ next_action: parsed.data.nextAction || null, next_action_due: parsed.data.nextActionDue || null })
    .eq("id", parsed.data.leadId)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The next action wasn't saved. Try again."));
  if (!data.length) return fail("That lead wasn't found.");
  revalidateLead(parsed.data.leadId);
  return ok();
}

const bulkSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Select at least one lead.").max(500),
  status: z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]]).optional(),
  campaignId: z.uuid().nullable().optional(),
  priority: z.enum(PRIORITIES as ["high", "medium", "low"]).optional(),
  addTag: z.string().optional(),
});

/** Bulk actions for everyone: set status, set campaign, set priority, add tag. */
export async function bulkUpdateLeads(input: z.input<typeof bulkSchema>): Promise<ActionResult<{ count: number }>> {
  const parsed = parseInput(bulkSchema, input);
  if (!parsed.ok) return parsed;
  const { ids, status, campaignId, priority, addTag } = parsed.data;
  const supabase = await createClient();

  if (addTag !== undefined) {
    const tag = normalizeTags([addTag]);
    if (!tag.ok || tag.value.length !== 1) return fail(tag.ok ? "Enter a tag." : tag.error, { addTag: tag.ok ? "Enter a tag." : tag.error });
    const { data: rows, error } = await supabase.from("leads").select("id, tags").in("id", ids);
    if (error) return fail(dbErrorMessage(error, "Tags weren't added. Try again."));
    let count = 0;
    for (const r of rows ?? []) {
      const next = normalizeTags([...r.tags, tag.value[0]!]);
      if (!next.ok) return fail(`${next.error} Some leads already have ${10} tags.`);
      const { error: e } = await supabase.from("leads").update({ tags: next.value }).eq("id", r.id);
      if (e) return fail(dbErrorMessage(e, "Tags weren't added. Try again."));
      count++;
    }
    revalidateLead();
    return ok({ count });
  }

  const update: { status?: LeadStatus; campaign_id?: string | null; priority?: "high" | "medium" | "low" } = {};
  if (status) update.status = status;
  if (campaignId !== undefined) update.campaign_id = campaignId;
  if (priority) update.priority = priority;
  if (!Object.keys(update).length) return fail("Pick what to change.");
  const { data, error } = await supabase.from("leads").update(update).in("id", ids).select("id");
  if (error) return fail(dbErrorMessage(error, "The leads weren't updated. Try again."));
  revalidateLead();
  return ok({ count: data.length });
}

const reassignSchema = z.object({ ids: z.array(z.uuid()).min(1, "Select at least one lead."), toId: z.uuid("Pick the new owner.") });

/** Founder: reassign one or more leads. Open opportunities follow (DB). */
export async function reassignLeads(input: { ids: string[]; toId: string }): Promise<ActionResult<{ count: number }>> {
  const parsed = parseInput(reassignSchema, input);
  if (!parsed.ok) return parsed;
  if (!(await requireFounder())) return fail(FOUNDER_ONLY);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .update({ owner_id: parsed.data.toId })
    .in("id", parsed.data.ids)
    .neq("owner_id", parsed.data.toId)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "The leads weren't reassigned. Try again."));
  revalidateLead();
  for (const id of parsed.data.ids) revalidatePath(`/leads/${id}`);
  revalidatePath("/pipeline");
  return ok({ count: data.length });
}

/** Founder: delete leads (cascades to contacts, activities, opportunities). The database rejects BDs. */
export async function deleteLeads(input: { ids: string[] }): Promise<ActionResult<{ count: number }>> {
  const parsed = parseInput(z.object({ ids: z.array(z.uuid()).min(1, "Select at least one lead.") }), input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").delete().in("id", parsed.data.ids).select("id");
  if (error) return fail(dbErrorMessage(error, "The leads weren't deleted. Try again."));
  if (!data.length) return fail("You can't delete leads. Mark it as Bad fit instead.");
  revalidateLead();
  return ok({ count: data.length });
}

/** Single delete from the lead page: the confirmation must type the company name. */
export async function deleteLead(input: { id: string; confirmName: string }): Promise<ActionResult> {
  const parsed = parseInput(z.object({ id: z.uuid(), confirmName: z.string() }), input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("company_name").eq("id", parsed.data.id).maybeSingle();
  if (!lead) return fail("That lead wasn't found.");
  if (lead.company_name.trim() !== parsed.data.confirmName.trim()) {
    return fail("Type the company name exactly to confirm.", { confirmName: "Type the company name exactly." });
  }
  const { data, error } = await supabase.from("leads").delete().eq("id", parsed.data.id).select("id");
  if (error) return fail(dbErrorMessage(error, "The lead wasn't deleted. Try again."));
  if (!data.length) return fail("You can't delete leads. Mark it as Bad fit instead.");
  revalidateLead();
  return ok();
}

// ---------- Contacts on the lead page -------------------------------------

export async function saveContact(input: ContactFormValues): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const leadId = z.uuid().safeParse(input.leadId);
  if (!leadId.success) return fail("That lead wasn't found.");
  const { data: lead } = await supabase.from("leads").select("id, country").eq("id", leadId.data).maybeSingle();
  if (!lead) return fail("That lead wasn't found.");
  const parsed = parseInput(makeContactSchema(lead.country), input);
  if (!parsed.ok) return parsed;
  const { leadId: _l, id, ...c } = parsed.data;
  void _l;
  const row = contactRow({ ...c }, lead.id);

  if (row.is_primary) {
    await supabase.from("contacts").update({ is_primary: false }).eq("lead_id", lead.id).eq("is_primary", true).neq("id", id ?? "00000000-0000-0000-0000-000000000000");
  }
  if (id) {
    const { data, error } = await supabase.from("contacts").update(row).eq("id", id).eq("lead_id", lead.id).select("id");
    if (error) return fail(dbErrorMessage(error, "The contact wasn't saved. Try again."));
    if (!data.length) return fail("That contact wasn't found.");
    revalidateLead(lead.id);
    return ok({ id });
  }
  const { count } = await supabase.from("contacts").select("id", { count: "exact", head: true }).eq("lead_id", lead.id);
  if ((count ?? 0) >= 10) return fail("A lead can have up to 10 contacts.");
  const { data, error } = await supabase
    .from("contacts")
    .insert({ ...row, is_primary: row.is_primary || count === 0 })
    .select("id")
    .single();
  if (error) return fail(dbErrorMessage(error, "The contact wasn't added. Try again."));
  revalidateLead(lead.id);
  return ok({ id: data.id });
}

export async function makePrimaryContact(input: { contactId: string }): Promise<ActionResult> {
  const id = z.uuid().safeParse(input.contactId);
  if (!id.success) return fail("That contact wasn't found.");
  const supabase = await createClient();
  const { data: c } = await supabase.from("contacts").select("id, lead_id").eq("id", id.data).maybeSingle();
  if (!c) return fail("That contact wasn't found.");
  await supabase.from("contacts").update({ is_primary: false }).eq("lead_id", c.lead_id).eq("is_primary", true);
  const { error } = await supabase.from("contacts").update({ is_primary: true }).eq("id", c.id);
  if (error) return fail(dbErrorMessage(error, "The primary contact wasn't changed. Try again."));
  revalidateLead(c.lead_id);
  return ok();
}

/** Anyone may remove a contact, unless it's the only one (docs/04 section 9). */
export async function deleteContact(input: { contactId: string }): Promise<ActionResult> {
  const id = z.uuid().safeParse(input.contactId);
  if (!id.success) return fail("That contact wasn't found.");
  const supabase = await createClient();
  const { data: c } = await supabase.from("contacts").select("id, lead_id, is_primary").eq("id", id.data).maybeSingle();
  if (!c) return fail("That contact wasn't found.");
  const { data: others } = await supabase
    .from("contacts")
    .select("id")
    .eq("lead_id", c.lead_id)
    .neq("id", c.id)
    .order("created_at")
    .limit(1);
  if (!others?.length) return fail("A lead needs at least one contact. Add another before removing this one.");
  const { error } = await supabase.from("contacts").delete().eq("id", c.id);
  if (error) return fail(dbErrorMessage(error, "The contact wasn't removed. Try again."));
  if (c.is_primary) await supabase.from("contacts").update({ is_primary: true }).eq("id", others[0]!.id);
  revalidateLead(c.lead_id);
  return ok();
}

const leadFieldSchema = z.object({ leadId: z.uuid(), field: z.enum(LEAD_FIELDS), value: z.unknown() });

/** Lead page → Details: edit one field in place. Same cleaning as the lead form; RLS decides who may edit. */
export async function updateLeadField(input: { leadId: string; field: LeadField; value: unknown }): Promise<ActionResult> {
  const parsed = parseInput(leadFieldSchema, input);
  if (!parsed.ok) return parsed;
  const { leadId, field } = parsed.data;
  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("id, country, channel_id, upwork_job_url").eq("id", leadId).maybeSingle();
  if (!lead) return fail("That lead wasn't found.");

  const cleaned = parseLeadField(field, parsed.data.value, lead.country);
  if (!cleaned.ok) return fail(cleaned.error, { value: cleaned.error });

  // The company phone can be the only way to reach them (docs/04 section 1); don't let it be cleared then.
  if (field === "company_phone" && cleaned.value === null) {
    const { data: contacts } = await supabase.from("contacts").select("email, phone, mobile_phone, linkedin_url").eq("lead_id", leadId);
    const reachable = (contacts ?? []).some((c) => c.email || c.phone || c.mobile_phone || c.linkedin_url);
    const { data: upwork } = await supabase.from("channels").select("id").ilike("name", "upwork").maybeSingle();
    const viaUpwork = !!upwork && lead.channel_id === upwork.id && !!lead.upwork_job_url;
    if (!reachable && !viaUpwork) return fail(REACH_ERROR, { value: "It's the only way to reach them. Add a contact method first." });
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ [field]: cleaned.value } as never)
    .eq("id", leadId)
    .select("id");
  if (error) return fail(dbErrorMessage(error, "That wasn't saved. Try again."));
  if (!data.length) return fail("That lead wasn't found.");
  revalidateLead(leadId);
  return ok();
}
