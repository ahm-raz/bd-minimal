import "server-only";
import { google, GOOGLE_TIMEOUT_MS } from "./config";

/**
 * Google Calendar events for meetings (docs/10 section 2). One-way: the app writes, never reads back.
 * The event id is derived from the meeting id, so a retried insert can never create a duplicate.
 */

export class GoogleApiError extends Error {
  constructor(
    public status: number,
    public reason: string,
  ) {
    super(`Google Calendar answered ${status}${reason ? ` (${reason})` : ""}`);
  }
}

/** Temporary problems are retried with backoff; the rest fail straight away. */
export function isTemporary(e: unknown): boolean {
  if (e instanceof GoogleApiError) {
    return e.status === 429 || e.status >= 500 || (e.status === 403 && /rateLimit|userRateLimit/i.test(e.reason));
  }
  return !(e instanceof Error && e.name === "GoogleAuthError");
}

/** Minutes to wait before try number `attempt` (1-based): 2, 4, 8 … up to 6 hours. */
export function backoffMinutes(attempt: number): number {
  return Math.min(2 ** Math.max(1, attempt), 360);
}
export const MAX_SYNC_ATTEMPTS = 8;

/** Google event ids use base32hex (0-9, a-v); a uuid without dashes is valid. */
export function eventIdFor(meetingId: string): string {
  return meetingId.replace(/-/g, "").toLowerCase();
}

export type EventInput = {
  meetingId: string;
  leadId: string;
  title: string;
  startsAtUtc: string;
  durationMin: number;
  timezone: string;
  location: string | null;
  agenda: string | null;
  reminders: number[];
  company: string;
  contact: { name: string; email: string | null; phone: string | null } | null;
  inviteContact: boolean;
  siteUrl: string;
};

export function buildEventBody(m: EventInput) {
  const start = new Date(m.startsAtUtc);
  const end = new Date(start.getTime() + m.durationMin * 60_000);
  const lines = [
    m.agenda,
    m.contact && `Contact: ${[m.contact.name, m.contact.email, m.contact.phone].filter(Boolean).join(" · ")}`,
    `Company: ${m.company}`,
    `Lead: ${m.siteUrl}/leads/${m.leadId}`,
  ].filter(Boolean);
  const attendees =
    m.inviteContact && m.contact?.email ? [{ email: m.contact.email, displayName: m.contact.name }] : undefined;
  return {
    id: eventIdFor(m.meetingId),
    summary: m.title,
    location: m.location ?? undefined,
    description: lines.join("\n"),
    start: { dateTime: start.toISOString(), timeZone: m.timezone },
    end: { dateTime: end.toISOString(), timeZone: m.timezone },
    reminders: { useDefault: false, overrides: m.reminders.map((minutes) => ({ method: "popup", minutes })) },
    attendees,
    guestsCanModify: false,
    extendedProperties: { private: { caoMeetingId: m.meetingId, caoLeadId: m.leadId } },
    source: { title: "Client Acquisition OS", url: `${m.siteUrl}/leads/${m.leadId}` },
  };
}

async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${google.apiBase()}/calendar/v3${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
    cache: "no-store",
  });
  if (res.status === 204) return null;
  const json = (await res.json().catch(() => null)) as {
    status?: string;
    error?: { errors?: { reason?: string }[]; status?: string };
  } | null;
  if (!res.ok) throw new GoogleApiError(res.status, json?.error?.errors?.[0]?.reason ?? json?.error?.status ?? "");
  return json;
}

const cal = (calendarId: string) => `/calendars/${encodeURIComponent(calendarId)}/events`;

export type UpsertResult = { eventId: string } | { removedInGoogle: true };

/**
 * Create or update the event.
 * - `known`: we created it before. Patch it; if the user deleted it in Google, report that rather than bring it back.
 * - otherwise insert with our id; if that id exists (e.g. we deleted it earlier), patch it back to confirmed.
 */
export async function upsertEvent(
  token: string,
  calendarId: string,
  body: ReturnType<typeof buildEventBody>,
  known: boolean,
): Promise<UpsertResult> {
  const sendUpdates = body.attendees ? "all" : "none";
  const { id, ...fields } = body;
  const patch = (restore: boolean) =>
    call(
      token,
      "PATCH",
      `${cal(calendarId)}/${id}?sendUpdates=${sendUpdates}`,
      restore ? { ...fields, status: "confirmed" } : fields,
    );
  if (known) {
    try {
      const ev = await patch(false);
      if (ev?.status === "cancelled") return { removedInGoogle: true };
      return { eventId: id };
    } catch (e) {
      if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return { removedInGoogle: true };
      throw e;
    }
  }
  try {
    await call(token, "POST", `${cal(calendarId)}?sendUpdates=${sendUpdates}`, body);
  } catch (e) {
    if (!(e instanceof GoogleApiError && e.status === 409)) throw e;
    await patch(true);
  }
  return { eventId: id };
}

/** Delete the event; already gone counts as done. */
export async function deleteEvent(
  token: string,
  calendarId: string,
  eventId: string,
  notifyGuests = false,
): Promise<void> {
  try {
    await call(token, "DELETE", `${cal(calendarId)}/${eventId}?sendUpdates=${notifyGuests ? "all" : "none"}`);
  } catch (e) {
    if (e instanceof GoogleApiError && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}
