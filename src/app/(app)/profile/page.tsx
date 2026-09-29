import type { Metadata } from "next";
import { Suspense } from "react";
import { requireViewer } from "@/server/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/common/page";
import { groupsFor } from "@/lib/notifications";
import { googleCalendarEnabled } from "@/server/google/config";
import { ProfileForm } from "./profile-form";
import { NotificationSettings } from "./notification-settings";
import { GoogleCalendarCard, type GoogleConnection } from "./google-calendar-card";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const calendarOn = googleCalendarEnabled() && viewer.role !== "social";
  const [{ data: me }, { data: conn }] = await Promise.all([
    supabase.from("profiles").select("meeting_reminders").eq("id", viewer.id).maybeSingle(),
    calendarOn
      ? supabase.from("google_connections").select("google_email, status, auto_add, last_error").maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const connection: GoogleConnection = conn
    ? { email: conn.google_email, status: conn.status, autoAdd: conn.auto_add, lastError: conn.last_error }
    : null;
  return (
    <>
      <PageHeader title="Profile" />
      <div className="flex flex-col gap-6">
        <ProfileForm fullName={viewer.fullName} timezone={viewer.timezone} email={viewer.email} />
        <NotificationSettings groups={groupsFor(viewer.role)} meetingReminders={me?.meeting_reminders ?? [30, 10]} />
        {calendarOn && (
          <Suspense>
            <GoogleCalendarCard connection={connection} />
          </Suspense>
        )}
      </div>
    </>
  );
}
