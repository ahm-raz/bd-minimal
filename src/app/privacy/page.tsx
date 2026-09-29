import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy | Client Acquisition OS" };

/** Public privacy notice. Google's OAuth consent screen links here (docs/10 section 2). */
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-canvas px-6 py-12">
      <article className="mx-auto flex max-w-2xl flex-col gap-4 text-ink">
        <h1 className="text-title">Privacy</h1>
        <p className="text-ink-muted">Client Acquisition OS is an internal sales tool used only by our own team. It isn&apos;t offered to the public.</p>

        <h2 className="mt-4 text-section">What we store</h2>
        <p>Team members&apos; names, work emails and time zones, and the sales data they enter: leads, contacts, activities, meetings, deals, tasks and posts.</p>

        <h2 className="mt-4 text-section">Google Calendar</h2>
        <p>
          A team member can choose to connect their own Google Calendar. We ask only for permission to create, change and delete events on
          calendars they own, and for their Google account email. We use it for one thing: adding the meetings they book in this app to their
          calendar, with the reminders they choose, and updating or removing those events when the meeting changes.
        </p>
        <p>
          We don&apos;t read their other events, and we don&apos;t share, sell or use Google data for anything else. The access token is stored
          encrypted. They can disconnect at any time from their Profile, which revokes our access; they can also remove it in their Google
          Account under Security → Third-party access.
        </p>
        <p>Our use of information received from Google APIs follows the Google API Services User Data Policy, including the Limited Use requirements.</p>

        <h2 className="mt-4 text-section">Contact</h2>
        <p>Questions or deletion requests: ask the founder of the team.</p>
      </article>
    </main>
  );
}
