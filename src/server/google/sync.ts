import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/database.types";
import { contactName } from "@/lib/format";
import { getViewer } from "@/server/auth";
import { backoffMinutes, buildEventBody, deleteEvent, isTemporary, MAX_SYNC_ATTEMPTS, upsertEvent } from "./calendar";
import { google, googleCalendarEnabled } from "./config";
import { decryptToken } from "./crypto";
import { GoogleAuthError, refreshAccessToken } from "./oauth";

/**
 * Meeting → Google Calendar sync (docs/10 section 2). Runs only in the meeting owner's own request,
 * with their own token: right after a meeting action, lazily on page loads, and from the Retry button.
 * A Google failure never loses the meeting; it stays "pending" and is retried with backoff.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;
type Session = { supabase: Supabase; userId: string; token: string; calendarId: string };

const RECONNECT = "Reconnect Google Calendar to keep adding meetings.";

/** The caller's session with a fresh access token, or null when not connected (or it needs a reconnect). */
async function openSession(): Promise<Session | null> {
  if (!googleCalendarEnabled()) return null;
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data: conn } = await supabase.rpc("my_google_token").maybeSingle();
  if (!conn || conn.status !== "active") return null;
  try {
    const token = await refreshAccessToken(decryptToken(conn.refresh_token_enc));
    return { supabase, userId: viewer.id, token, calendarId: conn.calendar_id };
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      await supabase.rpc("mark_google_needs_reconnect", { p_error: "Google access expired or was removed." });
    }
    return null;
  }
}

function sanitize(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Unknown error";
  // Never store anything that could contain a token.
  return msg.replace(/ya29\.[\w.-]+|1\/\/[\w.-]+/g, "[token]").slice(0, 300);
}

async function syncOne(s: Session, meetingId: string): Promise<void> {
  const { data: m } = await s.supabase
    .from("meetings")
    .select(
      "id, lead_id, owner_id, title, starts_at, duration_min, timezone, location, agenda, reminder_minutes, invite_contact, add_to_calendar, status, sync_version, gcal_event_id, gcal_calendar_id, gcal_synced_version, gcal_state, gcal_attempts, leads(company_name), contacts(first_name, last_name, email, phone, mobile_phone)",
    )
    .eq("id", meetingId)
    .maybeSingle();
  if (!m || m.owner_id !== s.userId) return;
  // Only record the result if nobody changed the meeting while we were talking to Google.
  const save = (fields: TablesUpdate<"meetings">) =>
    s.supabase.from("meetings").update(fields).eq("id", m.id).eq("sync_version", m.sync_version);

  const calendarId = m.gcal_calendar_id ?? s.calendarId;
  try {
    const remove = m.status === "cancelled" || !m.add_to_calendar;
    if (remove) {
      if (m.gcal_event_id) await deleteEvent(s.token, calendarId, m.gcal_event_id, m.invite_contact);
      await save({
        gcal_event_id: null,
        gcal_calendar_id: null,
        gcal_state: m.add_to_calendar ? "synced" : "off",
        gcal_synced_version: m.sync_version,
        gcal_attempts: 0,
        gcal_error: null,
        gcal_next_retry_at: null,
      });
      return;
    }
    const c = m.contacts;
    const body = buildEventBody({
      meetingId: m.id,
      leadId: m.lead_id,
      title: m.title,
      startsAtUtc: m.starts_at,
      durationMin: m.duration_min,
      timezone: m.timezone,
      location: m.location,
      agenda: m.agenda,
      reminders: m.reminder_minutes,
      company: m.leads?.company_name ?? "",
      contact: c ? { name: contactName(c), email: c.email, phone: c.phone ?? c.mobile_phone } : null,
      inviteContact: m.invite_contact,
      siteUrl: google.siteUrl(),
    });
    const res = await upsertEvent(s.token, calendarId, body, !!m.gcal_event_id);
    if ("removedInGoogle" in res) {
      await save({ gcal_state: "removed_in_google", gcal_error: null, gcal_attempts: 0, gcal_next_retry_at: null });
      return;
    }
    await save({
      gcal_event_id: res.eventId,
      gcal_calendar_id: calendarId,
      gcal_state: "synced",
      gcal_synced_version: m.sync_version,
      gcal_attempts: 0,
      gcal_error: null,
      gcal_next_retry_at: null,
    });
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      await s.supabase.rpc("mark_google_needs_reconnect", { p_error: "Google access expired or was removed." });
      await save({ gcal_state: "failed", gcal_error: RECONNECT });
      return;
    }
    const attempts = m.gcal_attempts + 1;
    if (isTemporary(e) && attempts < MAX_SYNC_ATTEMPTS) {
      await save({
        gcal_state: "pending",
        gcal_attempts: attempts,
        gcal_error: sanitize(e),
        gcal_next_retry_at: new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString(),
      });
    } else {
      await save({ gcal_state: "failed", gcal_attempts: attempts, gcal_error: sanitize(e), gcal_next_retry_at: null });
    }
  }
}

/** Sync one meeting now (after a meeting action). Never throws. */
export async function syncMeeting(meetingId: string): Promise<void> {
  try {
    const s = await openSession();
    if (s) await syncOne(s, meetingId);
  } catch {
    // The meeting is saved; the next page load retries.
  }
}

/** Lazy work for the signed-in user: due retries (up to 5) and old events to remove. Never throws. */
export async function syncMyPending(): Promise<void> {
  try {
    if (!googleCalendarEnabled()) return;
    const viewer = await getViewer();
    if (!viewer) return;
    const supabase = await createClient();
    const nowIso = new Date().toISOString();
    const [{ data: due }, { data: cleanup }] = await Promise.all([
      supabase
        .from("meetings")
        .select("id")
        .eq("owner_id", viewer.id)
        .eq("gcal_state", "pending")
        .or(`gcal_next_retry_at.is.null,gcal_next_retry_at.lte.${nowIso}`)
        .order("starts_at")
        .limit(5),
      supabase.from("calendar_cleanup").select("id, gcal_event_id, calendar_id").eq("user_id", viewer.id).limit(10),
    ]);
    if (!due?.length && !cleanup?.length) return;
    const s = await openSession();
    if (!s) return;
    for (const row of cleanup ?? []) {
      try {
        await deleteEvent(s.token, row.calendar_id, row.gcal_event_id);
        await supabase.from("calendar_cleanup").delete().eq("id", row.id);
      } catch {
        // Try again on a later visit.
      }
    }
    for (const row of due ?? []) await syncOne(s, row.id);
  } catch {
    // Never break a page load over calendar sync.
  }
}
