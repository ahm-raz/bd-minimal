import { cn } from "@/lib/utils";

/**
 * A drawn preview of the app for the public homepage: My Day pace bars beside a small pipeline board.
 * Pure markup with the app's own tokens, so it follows the theme and needs no image files.
 */
export function ProductPreview() {
  return (
    <figure className="overflow-hidden rounded-xl border border-line bg-surface shadow-overlay">
      <div className="flex items-center gap-1.5 border-b border-line bg-surface-muted px-4 py-2.5" aria-hidden>
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="size-2.5 rounded-full bg-line-strong" />
        <span className="ml-3 rounded-md bg-surface px-2 py-0.5 font-mono text-micro text-ink-muted">bd-minimal.vercel.app/my-day</span>
      </div>
      <div className="grid md:grid-cols-[180px_1fr]" aria-hidden>
        <nav className="hidden flex-col gap-1 border-r border-line p-3 md:flex">
          {["My Day", "Leads", "Pipeline", "Content", "Tasks", "Performance"].map((item, i) => (
            <span
              key={item}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-small",
                i === 0 ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-muted",
              )}
            >
              {item}
            </span>
          ))}
        </nav>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_1.3fr]">
          <div className="rounded-lg border border-line p-4">
            <p className="text-section">Today so far</p>
            <div className="mt-3 flex flex-col gap-3">
              <Pace label="Leads added" done={18} target={25} />
              <Pace label="Outreach" done={41} target={50} />
              <Pace label="Follow-ups" done={12} target={12} />
            </div>
            <div className="mt-4 rounded-md bg-surface-muted p-3">
              <p className="text-micro text-ink-muted">Next follow-up</p>
              <p className="mt-0.5 text-small font-medium">Send case study to Smile Dental Austin</p>
              <p className="text-micro text-ink-muted">Due today, 3:00 PM</p>
            </div>
          </div>
          <div className="rounded-lg border border-line p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-section">Pipeline</p>
              <p className="num text-micro text-ink-muted">Open $48,500 · weighted $21,300</p>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Column title="Qualified" tone="bg-stage-qualified text-stage-qualified-ink" cards={["Harbor Law", "Peak Dental"]} />
              <Column title="Proposal sent" tone="bg-stage-proposal text-stage-proposal-ink" cards={["Northside Clinic"]} />
              <Column title="Won" tone="bg-stage-won text-stage-won-ink" cards={["Brightline AI"]} />
            </div>
          </div>
        </div>
      </div>
      <figcaption className="sr-only">An illustration of the My Day and Pipeline screens, with example data.</figcaption>
    </figure>
  );
}

function Pace({ label, done, target }: { label: string; done: number; target: number }) {
  const pct = Math.min(100, Math.round((done / target) * 100));
  return (
    <div>
      <div className="flex justify-between text-small">
        <span>{label}</span>
        <span className="num text-ink-muted">
          {done} of {target}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className={cn("h-full rounded-full", pct >= 100 ? "bg-ok" : "bg-accent-strong")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Column({ title, tone, cards }: { title: string; tone: string; cards: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={cn("w-fit rounded-full px-2 py-0.5 text-micro", tone)}>{title}</span>
      {cards.map((c) => (
        <span key={c} className="rounded-md border border-line bg-surface px-2 py-2 text-micro shadow-card">
          {c}
        </span>
      ))}
    </div>
  );
}
