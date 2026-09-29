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
import { getDepartment } from "@/server/department";
import { NavProgressProvider } from "@/components/app/nav-progress";
import { showsSocial } from "@/lib/department";
import { groupsFor } from "@/lib/notifications";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const department = await getDepartment(viewer);
  const [lists, reviewCount, unread] = await Promise.all([
    getLists(),
    viewer.role === "founder" && showsSocial(department) ? needsReviewCount() : 0,
    unreadNotificationCount(groupsFor(viewer.role, department)),
  ]);
  // Housekeeping after the response: due Google Calendar retries and old notifications (docs/10).
  after(async () => {
    await syncMyPending();
  });

  return (
    <ProfileProvider value={viewer}>
      <AppProvider lists={lists} department={department}>
        <NotificationsProvider key={department} initialUnread={unread}>
          <NavProgressProvider>
            <a
              href="#main"
              className="sr-only z-[70] rounded-md bg-surface px-3 py-2 text-body font-medium text-ink shadow-overlay focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            >
              Skip to content
            </a>
            <div className="flex min-h-screen flex-col lg:flex-row">
              <Sidebar reviewCount={reviewCount} />
              <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
                <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-6 lg:px-8">{children}</div>
              </main>
            </div>
          </NavProgressProvider>
          <LeadSheet />
          <LogActivitySheet />
          {viewer.role !== "bd" && showsSocial(department) && <PostSheet />}
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
