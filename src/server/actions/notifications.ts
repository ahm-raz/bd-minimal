"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  NOTIFICATION_GROUPS,
  defaultPrefs,
  groupsFor,
  type NotificationItem,
  type NotificationPref,
  type UpcomingItem,
} from "@/lib/notifications";
import { MAX_REMINDERS, MAX_REMINDER_MINUTES } from "@/lib/validation/meeting";
import { getViewer } from "@/server/auth";
import { getDepartment } from "@/server/department";
import { loadUpcoming } from "@/server/queries/upcoming";
import { dbErrorMessage, fail, ok, parseInput, type ActionResult } from "@/server/result";

/** Notification centre actions (docs/10 section 3). RLS limits everything to the caller's own rows. */

const SESSION_ENDED = "Your session has ended. Sign in again.";
const NOTIFICATIONS_PAGE = 30;

const listSchema = z.object({
  beforeId: z.number().int().positive().nullable().optional(),
  group: z.enum(NOTIFICATION_GROUPS).nullable().optional(),
  unreadOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export async function listNotifications(
  input: z.input<typeof listSchema> = {},
): Promise<ActionResult<{ items: NotificationItem[]; unread: number; hasMore: boolean }>> {
  const viewer = await getViewer();
  if (!viewer) return fail(SESSION_ENDED);
  const parsed = parseInput(listSchema, input);
  if (!parsed.ok) return parsed;
  const { beforeId, group, unreadOnly } = parsed.data;
  // The founder's department view: only that department's groups (a UX filter; RLS keeps rows private).
  const groups = groupsFor(viewer.role, await getDepartment(viewer));
  const limit = parsed.data.limit ?? NOTIFICATIONS_PAGE;
  const supabase = await createClient();
  let q = supabase
    .from("notifications")
    .select("id, kind, kind_group, priority, title, link, created_at, read_at")
    .order("id", { ascending: false })
    .limit(limit + 1)
    .in("kind_group", groups);
  if (beforeId) q = q.lt("id", beforeId);
  if (group) q = q.eq("kind_group", group);
  if (unreadOnly) q = q.is("read_at", null);
  const [{ data, error }, { count }] = await Promise.all([
    q,
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null)
      .in("kind_group", groups),
  ]);
  if (error) return fail(dbErrorMessage(error, "Notifications didn't load. Try again."));
  const rows = data ?? [];
  return ok({
    items: rows.slice(0, limit).map((n) => ({
      id: n.id,
      kind: n.kind,
      group: n.kind_group as NotificationItem["group"],
      priority: n.priority as NotificationItem["priority"],
      title: n.title,
      link: n.link,
      createdAt: n.created_at,
      readAt: n.read_at,
    })),
    unread: count ?? 0,
    hasMore: rows.length > limit,
  });
}

const readSchema = z.object({
  ids: z.array(z.number().int().positive()).max(200).optional(),
  all: z.boolean().optional(),
  unread: z.boolean().optional(),
});

/** Mark some (or all) as read; `unread: true` marks them unread again. */
export async function markNotificationsRead(input: z.input<typeof readSchema>): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail(SESSION_ENDED);
  const parsed = parseInput(readSchema, input);
  if (!parsed.ok) return parsed;
  const { ids, all, unread } = parsed.data;
  if (!all && !ids?.length) return ok();
  const supabase = await createClient();
  let q = supabase.from("notifications").update({ read_at: unread ? null : new Date().toISOString() });
  // "Mark all" stays inside the department view the founder is looking at.
  q = all
    ? q.is("read_at", null).in("kind_group", groupsFor(viewer.role, await getDepartment(viewer)))
    : q.in("id", ids!);
  const { error } = await q;
  if (error) return fail(dbErrorMessage(error, "That didn't save. Try again."));
  return ok();
}

export async function getUpcoming(): Promise<ActionResult<UpcomingItem[]>> {
  const viewer = await getViewer();
  if (!viewer) return fail(SESSION_ENDED);
  return ok(await loadUpcoming(viewer, await getDepartment(viewer)));
}

export async function getNotificationPrefs(): Promise<
  ActionResult<{ prefs: NotificationPref[]; meetingReminders: number[] }>
> {
  const viewer = await getViewer();
  if (!viewer) return fail(SESSION_ENDED);
  const supabase = await createClient();
  const [{ data: rows }, { data: me }] = await Promise.all([
    supabase.from("notification_prefs").select("kind_group, in_app, browser"),
    supabase.from("profiles").select("meeting_reminders").eq("id", viewer.id).maybeSingle(),
  ]);
  const prefs = defaultPrefs().map((d) => {
    const r = rows?.find((x) => x.kind_group === d.group);
    return r ? { group: d.group, inApp: r.in_app, browser: r.browser } : d;
  });
  return ok({ prefs, meetingReminders: me?.meeting_reminders ?? [30, 10] });
}

const prefSchema = z.object({ group: z.enum(NOTIFICATION_GROUPS), inApp: z.boolean(), browser: z.boolean() });

export async function saveNotificationPref(input: z.input<typeof prefSchema>): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail(SESSION_ENDED);
  const parsed = parseInput(prefSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const { error } = await supabase.from("notification_prefs").upsert({
    user_id: viewer.id,
    kind_group: parsed.data.group,
    in_app: parsed.data.inApp,
    browser: parsed.data.browser,
  });
  if (error) return fail(dbErrorMessage(error, "That setting didn't save. Try again."));
  return ok();
}

const remindersSchema = z.object({
  reminders: z
    .array(z.number().int().min(0).max(MAX_REMINDER_MINUTES, "Reminders can be up to 4 weeks before."))
    .max(MAX_REMINDERS, "Pick up to 5 reminders."),
});

export async function saveMeetingReminders(input: z.input<typeof remindersSchema>): Promise<ActionResult> {
  const viewer = await getViewer();
  if (!viewer) return fail(SESSION_ENDED);
  const parsed = parseInput(remindersSchema, input);
  if (!parsed.ok) return parsed;
  const supabase = await createClient();
  const reminders = [...new Set(parsed.data.reminders)].sort((a, b) => b - a);
  const { error } = await supabase.from("profiles").update({ meeting_reminders: reminders }).eq("id", viewer.id);
  if (error) return fail(dbErrorMessage(error, "The reminders didn't save. Try again."));
  revalidatePath("/profile");
  return ok();
}
