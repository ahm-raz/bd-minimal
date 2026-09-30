import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  CalendarCheck,
  Columns3,
  FileSpreadsheet,
  ListChecks,
  Lock,
  Megaphone,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPreview } from "@/components/home/product-preview";

export const metadata: Metadata = {
  title: "Client Acquisition OS",
  description:
    "A CRM for agencies and offices: detailed leads, logged outreach, a pipeline board, daily tasks and live team performance in one place.",
  // The Search Console HTML tag for Google's OAuth verification, set in Vercel without a code change.
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION },
};

const ROLES = [
  {
    title: "Founder",
    body: "Sees the whole team's work as it happens, assigns daily tasks, sets weekly targets and reviews performance from every angle.",
  },
  {
    title: "Business developers",
    body: "Add detailed leads, log every message and call with its outcome, and move deals from first reply to signed contract.",
  },
  {
    title: "Social media manager",
    body: "Works from a content calendar: drafts posts, sends them for review and marks them live, with on-time numbers kept for them.",
  },
];

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Building2,
    title: "Detailed leads",
    body: "Company, location, website, LinkedIn and every decision maker, with a completeness score that shows what's missing.",
  },
  {
    icon: MessageSquareText,
    title: "Outreach you can trust",
    body: "Every message, call and reply is an activity with an outcome, so reply and meeting rates are real, not guessed.",
  },
  {
    icon: Columns3,
    title: "Pipeline board",
    body: "Drag deals from Qualified to Won. Open and weighted value update at once, and stuck deals are flagged.",
  },
  {
    icon: ListChecks,
    title: "Daily tasks and targets",
    body: "Tasks like “Add 25 leads” tick themselves off as the work is logged. Pace bars show each person where they stand.",
  },
  {
    icon: BarChart3,
    title: "Live feed and performance",
    body: "A live feed of the team's work, plus a scoreboard by person, niche, channel and campaign with one definition per number.",
  },
  {
    icon: Megaphone,
    title: "Content calendar",
    body: "Posting schedules create planned posts. Review, approve and track what went out on time across every account.",
  },
  {
    icon: CalendarCheck,
    title: "Meetings and reminders",
    body: "Book meetings from a lead, get reminders in the app, and add them to your own Google Calendar if you choose.",
  },
  {
    icon: FileSpreadsheet,
    title: "Spreadsheet import",
    body: "Bring existing leads in from a CSV file. Every row is checked first, and the file goes in whole or not at all.",
  },
];

const STEPS = [
  { title: "Add leads", body: "BDs add detailed leads every day, or import the ones they already have." },
  { title: "Work the outreach", body: "Log each touch with its outcome. Follow-ups and meetings surface on My Day." },
  { title: "Close and review", body: "Move deals through the pipeline while the founder tracks tasks, targets and results." },
];

const SECURITY = [
  "Each person sees only their own leads and deals; the founder sees everything. The database enforces this, not just the screens.",
  "Access is by invitation only. Deactivating someone blocks their sign-in straight away.",
  "Google Calendar access is optional, stored encrypted, and can be removed at any time.",
];

/** Public homepage for signed-out visitors; the proxy sends signed-in users on "/" to My Day. */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-6">
          <Link href="/" className="flex items-center gap-2 font-medium">
            <BrandMark />
            <span>Client Acquisition OS</span>
          </Link>
          <nav aria-label="Sections" className="ml-auto hidden items-center gap-5 text-small text-ink-muted md:flex">
            <a href="#features" className="hover:text-ink">
              Features
            </a>
            <a href="#how-it-works" className="hover:text-ink">
              How it works
            </a>
            <a href="#security" className="hover:text-ink">
              Security
            </a>
            <a href="#google-calendar" className="hover:text-ink">
              Google Calendar
            </a>
          </nav>
          <Button asChild size="sm" className="ml-auto md:ml-0">
            <Link href="/login">Log in</Link>
          </Button>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-16 pb-12 md:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="mx-auto w-fit rounded-full border border-line bg-surface px-3 py-1 text-micro text-ink-muted">
              A CRM for agencies and offices
            </p>
            <h1 className="mt-5 font-display text-[40px] leading-[1.1] font-semibold tracking-tight md:text-[56px]">
              Client Acquisition OS
            </h1>
            <p className="mt-5 text-[18px] leading-relaxed text-ink-muted">
              Every lead, every follow-up and every deal in one place. Business developers add leads, log outreach and move deals through a
              pipeline. The founder assigns daily tasks and sees how the team is doing, as it happens.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/login">
                  Log in <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary">
                <a href="#features">See what it does</a>
              </Button>
            </div>
          </div>
          <div className="mt-14">
            <ProductPreview />
          </div>
        </section>

        <section aria-labelledby="roles" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <SectionHeading id="roles" eyebrow="Built for the whole team" title="One app, three clear roles" />
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {ROLES.map((r) => (
                <div key={r.title} className="rounded-lg border border-line bg-canvas p-6">
                  <h3 className="text-section">{r.title}</h3>
                  <p className="mt-2 text-body text-ink-muted">{r.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" aria-labelledby="features-title" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionHeading id="features-title" eyebrow="Features" title="Everything the sales day needs, nothing it doesn't" />
            <div className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map(({ icon: Icon, title, body }) => (
                <div key={title}>
                  <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                    <Icon className="size-4.5" aria-hidden />
                  </span>
                  <h3 className="mt-4 text-section">{title}</h3>
                  <p className="mt-1.5 text-body text-ink-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-16 border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionHeading id="how-title" eyebrow="How it works" title="From first message to signed deal" />
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.title} className="rounded-lg border border-line bg-canvas p-6">
                  <span className="num flex size-8 items-center justify-center rounded-full bg-accent-strong text-small font-semibold text-on-accent">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-section">{s.title}</h3>
                  <p className="mt-1.5 text-body text-ink-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="security" aria-labelledby="security-title" className="scroll-mt-16">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 md:grid-cols-[1fr_1.2fr] md:items-start">
            <div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
                <Lock className="size-4.5" aria-hidden />
              </span>
              <h2 id="security-title" className="mt-4 font-display text-[28px] leading-tight font-semibold">
                Private by default
              </h2>
              <p className="mt-3 text-body text-ink-muted">
                Your office&apos;s data belongs to your office. Access rules are built into the database itself.
              </p>
            </div>
            <ul className="flex flex-col gap-4">
              {SECURITY.map((s) => (
                <li key={s} className="rounded-lg border border-line bg-surface p-5 text-body">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="google-calendar" aria-labelledby="gcal-title" className="scroll-mt-16 border-y border-line bg-surface">
          <div className="mx-auto max-w-3xl px-6 py-20">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent-strong">
              <CalendarCheck className="size-4.5" aria-hidden />
            </span>
            <h2 id="gcal-title" className="mt-4 font-display text-[28px] leading-tight font-semibold">
              Google Calendar
            </h2>
            <p className="mt-3 text-body leading-relaxed">
              Team members can choose to connect their own Google Calendar. We only create, update and delete the meetings they book in the app,
              on calendars they own. We don&apos;t read their other events. They can disconnect at any time from their Profile.
            </p>
            <p className="mt-3 text-body text-ink-muted">
              Read more in our{" "}
              <Link href="/privacy" className="text-accent-strong underline-offset-4 hover:underline">
                privacy notice
              </Link>
              .
            </p>
          </div>
        </section>

        <section aria-labelledby="cta-title">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <div className="rounded-xl bg-accent-strong px-8 py-12 text-center text-on-accent md:py-16">
              <h2 id="cta-title" className="font-display text-[28px] leading-tight font-semibold md:text-[34px]">
                Ready for today&apos;s leads?
              </h2>
              <p className="mx-auto mt-3 max-w-xl opacity-90">Sign in with the account your office set up for you.</p>
              <Button asChild size="lg" variant="secondary" className="mt-7">
                <Link href="/login">
                  Log in <ArrowRight aria-hidden />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 text-small text-ink-muted md:flex-row md:items-center">
          <div className="flex items-center gap-2">
            <BrandMark />
            <span>© {new Date().getFullYear()} Client Acquisition OS</span>
          </div>
          <nav aria-label="Legal" className="flex gap-5 md:ml-auto">
            <Link href="/privacy" className="hover:text-ink hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink hover:underline">
              Terms
            </Link>
            <a href="mailto:ahmrazsal7@gmail.com" className="hover:text-ink hover:underline">
              Contact
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div className="max-w-2xl">
      <p className="text-micro tracking-wide text-accent-strong uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 font-display text-[28px] leading-tight font-semibold md:text-[34px]">
        {title}
      </h2>
    </div>
  );
}

function BrandMark() {
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-strong font-display text-small font-semibold text-on-accent"
    >
      C
    </span>
  );
}
