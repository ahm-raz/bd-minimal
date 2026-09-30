import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TablesUpdate } from "@/lib/database.types";
import { contactName } from "@/lib/format";
import { getViewer } from "@/server/auth";
import {
  backoffMinutes,
  buildEventBody,
  deleteEvent,
  GoogleApiError,
  isTemporary,
  MAX_SYNC_ATTEMPTS,
  upsertEvent,
} from "./calendar";
import { google, googleCalendarEnabled } from "./config";
import { decryptToken } from "./crypto";
import { GoogleAuthError, refreshAccessToken } from "./oauth";

/**
 * Meeting → Google Calendar sync (docs/10 section 2). Runs only in the meeting owner's own request,
 * with their own token: right after a meeting action, lazily on page loads, and from the Retry button.
 * A Google failure never loses the meeting; it stays "pending" and is retried with backoff.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;
/** Who the sync runs for: the signed-in user's own Supabase client (RLS applies) and id. */
export type SyncContext = { supabase: Supabase; userId: string };
type Session = SyncContext & { token: string; calendarId: string };

const RECONNECT = "Reconnect Google Calendar to keep adding meetings.";
const ACCESS_LOST = "Google access expired or was removed.";

/**
 * Problems only a reconnect fixes: Google refused the refresh token, the Calendar API rejected our
 * token (401), or the grant lacks the calendar scope (403 insufficientPermissions).
 */
function needsReconnect(e: unknown): boolean {
  if (e instanceof GoogleAuthError) return true;
  if (!(e instanceof GoogleApiError)) return false;
  return (
    e.status === 401 ||
    (e.status === 403 && /insufficientPermissions|insufficient_?scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(e.reason))
  );
}

/** Flags the caller's connection, which shows "Needs reconnect" and the reconnect banner (docs/10 section 2). */
async function markNeedsReconnect(supabase: Supabase, error: string): Promise<void> {
  await supabase.rpc("mark_google_needs_reconnect", { p_error: error });
}

/** The signed-in user's context, for server actions and route handlers. */
async function currentContext(): Promise<SyncContext | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  return { supabase: await createClient(), userId: viewer.id };
}

/**
 * For after() in a page or layout: Next 16 forbids cookies() inside after() during a render, so build
 * the client now (reads the request cookies) and pass it in. Cheap: no network call.
 */
export async function syncContextFor(userId: string): Promise<SyncContext | null> {
  if (!googleCalendarEnabled()) return null;
  return { supabase: await createClient(), userId };
}

/** The caller's session with a fresh access token, or null when not connected (or it needs a reconnect). */
async function openSession(ctx: SyncContext): Promise<Session | null> {
  if (!googleCalendarEnabled()) return null;
  const { supabase, userId } = ctx;
  const { data: conn } = await supabase.rpc("my_google_token").maybeSingle();
  if (!conn || conn.status !== "active") return null;
  let refreshToken: string;
  try {
    refreshToken = decryptToken(conn.refresh_token_enc);
  } catch {
    // Changed data or a rotated key: the stored token is unusable until the user connects again.
    await markNeedsReconnect(supabase, "The saved Google access can't be read. Connect again.");
    return null;
  }
  try {
    const token = await refreshAccessToken(refreshToken);
    return { supabase, userId, token, calendarId: conn.calendar_id };
  } catch (e) {
    if (needsReconnect(e)) await markNeedsReconnect(supabase, ACCESS_LOST);
    return null;
  }
}

function sanitize(e: unknown): string {
  const msg = e instanceof Error ? e.message : "Unknown error";
  // Never store anything that could contain a token.
  return msg.replace(/ya29\.[\w.-]+|1\/\/[\w.-]+/g, "[token]").slice(0, 300);
}

/** Returns false when the connection needs a reconnect, so callers stop trying other meetings. */
async function syncOne(s: Session, meetingId: string): Promise<boolean> {
  const { data: m } = await s.supabase
    .from("meetings")
    .select(
      "id, lead_id, owner_id, title, starts_at, duration_min, timezone, location, agenda, reminder_minutes, invite_contact, add_to_calendar, status, sync_version, gcal_event_id, gcal_calendar_id, gcal_synced_version, gcal_state, gcal_attempts, leads(company_name), contacts(first_name, last_name, email, phone, mobile_phone)",
    )
    .eq("id", meetingId)
    .maybeSingle();
  if (!m || m.owner_id !== s.userId) return true;
  // Only record the result if nobody changed the meeting while we were talking to Google.
  // gcal_* fields are server-only (docs/10): the database accepts them only through set_meeting_gcal(),
  // which also checks the caller owns the meeting.
  type GcalFields = Pick<
    TablesUpdate<"meetings">,
    | "gcal_event_id"
    | "gcal_calendar_id"
    | "gcal_state"
    | "gcal_synced_version"
    | "gcal_attempts"
    | "gcal_error"
    | "gcal_next_retry_at"
  >;
  const save = (fields: GcalFields) =>
    s.supabase.rpc("set_meeting_gcal", { p_meeting: m.id, p_sync_version: m.sync_version, p_fields: fields });

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
      return true;
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
      return true;
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
    return true;
  } catch (e) {
    if (needsReconnect(e)) {
      await markNeedsReconnect(s.supabase, ACCESS_LOST);
      // Stays pending without using up a try: reconnecting resumes syncing (docs/10 section 5).
      await save({ gcal_state: "pending", gcal_error: RECONNECT, gcal_next_retry_at: null });
      return false;
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
    return true;
  }
}

/** Sync one meeting now (after a meeting action). Never throws. */
export async function syncMeeting(meetingId: string): Promise<void> {
  try {
    const ctx = await currentContext();
    const s = ctx && (await openSession(ctx));
    if (s) await syncOne(s, meetingId);
  } catch {
    // The meeting is saved; the next page load retries.
  }
}

/**
 * Lazy work for the signed-in user: due retries (up to 5) and old events to remove. Never throws.
 * Pass a context from syncContextFor() when calling inside after() from a page or layout.
 */
export async function syncMyPending(context?: SyncContext | null): Promise<void> {
  try {
    if (!googleCalendarEnabled()) return;
    const ctx = context === undefined ? await currentContext() : context;
    if (!ctx) return;
    const { supabase, userId } = ctx;
    const nowIso = new Date().toISOString();
    const [{ data: due }, { data: cleanup }] = await Promise.all([
      supabase
        .from("meetings")
        .select("id")
        .eq("owner_id", userId)
        .eq("gcal_state", "pending")
        .or(`gcal_next_retry_at.is.null,gcal_next_retry_at.lte.${nowIso}`)
        .order("starts_at")
        .limit(5),
      supabase.from("calendar_cleanup").select("id, gcal_event_id, calendar_id").eq("user_id", userId).limit(10),
    ]);
    if (!due?.length && !cleanup?.length) return;
    const s = await openSession(ctx);
    if (!s) return;
    for (const row of cleanup ?? []) {
      try {
        await deleteEvent(s.token, row.calendar_id, row.gcal_event_id);
        await supabase.from("calendar_cleanup").delete().eq("id", row.id);
      } catch (e) {
        if (needsReconnect(e)) {
          await markNeedsReconnect(supabase, ACCESS_LOST);
          return;
        }
        // Try again on a later visit.
      }
    }
    for (const row of due ?? []) {
      if (!(await syncOne(s, row.id))) return;
    }
  } catch {
    // Never break a page load over calendar sync.
  }
}
