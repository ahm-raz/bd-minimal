import { Suspense } from "react";
import { requireViewer } from "@/server/auth";
import { getLists } from "@/server/queries/lists";
import { AppProvider } from "@/components/app/app-provider";
import { ProfileProvider } from "@/components/app/profile-provider";
import { Sidebar } from "@/components/app/sidebar";
import { RouteNotice } from "@/components/app/route-notice";
import { LeadSheet } from "@/components/leads/lead-sheet";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const lists = await getLists();

  return (
    <ProfileProvider value={viewer}>
      <AppProvider lists={lists}>
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar />
          <main id="main" className="min-w-0 flex-1">
            <div className="mx-auto w-full max-w-[1440px] p-4 sm:p-6">{children}</div>
          </main>
        </div>
        <LeadSheet />
        <Suspense>
          <RouteNotice />
        </Suspense>
      </AppProvider>
    </ProfileProvider>
  );
}
