import { Suspense } from "react";
import { requireViewer } from "@/server/auth";
import { getLists } from "@/server/queries/lists";
import { needsReviewCount } from "@/server/queries/content";
import { AppProvider } from "@/components/app/app-provider";
import { ProfileProvider } from "@/components/app/profile-provider";
import { Sidebar } from "@/components/app/sidebar";
import { RouteNotice } from "@/components/app/route-notice";
import { LeadSheet } from "@/components/leads/lead-sheet";
import { LogActivitySheet } from "@/components/activities/log-activity-sheet";
import { Shortcuts } from "@/components/app/shortcuts";
import { CommandMenu } from "@/components/app/command-menu";
import { PostSheet } from "@/components/content/post-sheet";
import { NotificationsProvider } from "@/components/notifications/notifications-provider";
import { unreadNotificationCount } from "@/server/queries/notifications";
import { after } from "next/server";
import { syncMyPending } from "@/server/google/sync";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const [lists, reviewCount, unread] = await Promise.all([
    getLists(),
    viewer.role === "founder" ? needsReviewCount() : 0,
    unreadNotificationCount(),
  ]);
  // Housekeeping after the response: due Google Calendar retries and old notifications (docs/10).
  after(async () => {
    await syncMyPending();
  });

  return (
    <ProfileProvider value={viewer}>
      <AppProvider lists={lists}>
        <NotificationsProvider initialUnread={unread}>
          <div className="flex min-h-screen flex-col lg:flex-row">
            <Sidebar reviewCount={reviewCount} />
            <main id="main" className="min-w-0 flex-1">
              <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-6">{children}</div>
            </main>
          </div>
          <LeadSheet />
          <LogActivitySheet />
          {viewer.role !== "bd" && <PostSheet />}
          <Shortcuts />
          <CommandMenu />
          <Suspense>
            <RouteNotice />
          </Suspense>
        </NotificationsProvider>
      </AppProvider>
    </ProfileProvider>
  );
}
