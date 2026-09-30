import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Client Acquisition OS",
  // The Search Console HTML tag for Google's OAuth verification, set in Vercel without a code change.
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
};

/** Public homepage for signed-out visitors; the proxy sends signed-in users on "/" to My Day. */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-canvas px-6 py-12">
      <article className="mx-auto flex max-w-2xl flex-col gap-4 text-ink">
        <h1 className="text-title">Client Acquisition OS</h1>
        <p className="text-ink-muted">
          A simple CRM for agencies and offices. Business developers add leads, log outreach and move deals through a pipeline. The founder
          assigns daily tasks and sees how the team is doing.
        </p>

        <h2 className="mt-4 text-section">Google Calendar</h2>
        <p>
          Team members can choose to connect their own Google Calendar. We only create, update and delete the meetings they book in the app,
          on calendars they own. We don&apos;t read their other events. They can disconnect at any time from their Profile.
        </p>

        <div className="mt-4">
          <Button asChild size="form">
            <Link href="/login">Log in</Link>
          </Button>
        </div>

        <footer className="mt-8 flex gap-4 border-t border-line pt-4 text-small text-ink-muted">
          <Link href="/privacy" className="hover:text-ink hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink hover:underline">
            Terms
          </Link>
        </footer>
      </article>
    </main>
  );
}
