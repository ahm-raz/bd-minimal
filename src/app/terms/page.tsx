import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms | Client Acquisition OS" };

/** Public terms of use. Linked from the homepage and the privacy page. */
export default function TermsPage() {
  return (
    <main className="min-h-screen bg-canvas px-6 py-12">
      <article className="mx-auto flex max-w-2xl flex-col gap-4 text-ink">
        <h1 className="text-title">Terms</h1>
        <p className="text-ink-muted">Last updated 30 September 2026</p>

        <h2 className="mt-4 text-section">Who can use it</h2>
        <p>
          Client Acquisition OS is for the staff of offices and agencies that subscribe to it. You can sign in only if your office has added
          you as a team member.
        </p>

        <h2 className="mt-4 text-section">Your data</h2>
        <p>
          Each office owns the data it enters: leads, contacts, activities, meetings, deals, tasks and posts. It&apos;s kept private from other
          offices. We export an office&apos;s data on request, and we delete it after its subscription ends.
        </p>

        <h2 className="mt-4 text-section">Acceptable use</h2>
        <p>
          Use the app for your office&apos;s own sales and outreach work. Don&apos;t try to reach data you haven&apos;t been given access to,
          don&apos;t share your login, and don&apos;t use the app to send spam or break the law.
        </p>

        <h2 className="mt-4 text-section">Google Calendar</h2>
        <p>
          Connecting Google Calendar is optional. How we use Google data is described in our{" "}
          <Link href="/privacy" className="text-accent-strong underline-offset-4 hover:underline">
            privacy notice
          </Link>
          .
        </p>

        <h2 className="mt-4 text-section">No warranty</h2>
        <p>
          The app is provided as it is, without warranties of any kind. To the extent the law allows, we aren&apos;t liable for lost data,
          lost business or indirect damages that come from using it.
        </p>

        <h2 className="mt-4 text-section">Changes to these terms</h2>
        <p>We may update these terms. When we do, we change the date at the top of this page.</p>

        <h2 className="mt-4 text-section">Contact</h2>
        <p>
          Questions about these terms:{" "}
          <a href="mailto:ahmrazsal7@gmail.com" className="text-accent-strong underline-offset-4 hover:underline">
            ahmrazsal7@gmail.com
          </a>
        </p>
      </article>
    </main>
  );
}
