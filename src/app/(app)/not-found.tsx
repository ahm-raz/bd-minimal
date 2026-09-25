import Link from "next/link";
import { Panel } from "@/components/common/page";

/** 404 inside the app shell, e.g. a lead that doesn't exist or belongs to someone else. */
export default function AppNotFound() {
  return (
    <Panel className="mx-auto mt-12 max-w-md p-6">
      <h1 className="text-title text-ink">Not found</h1>
      <p className="mt-2 text-body text-ink-muted">
        This page doesn&apos;t exist, or it isn&apos;t yours to see. Check the link, or go back to your leads.
      </p>
      <div className="mt-4 flex gap-2">
        <Link href="/leads" className="inline-flex h-8 items-center rounded-md bg-accent-strong px-3 text-body font-medium text-on-accent hover:bg-accent-hover">
          Go to Leads
        </Link>
        <Link href="/my-day" className="inline-flex h-8 items-center rounded-md border border-line bg-surface px-3 text-body font-medium text-ink hover:bg-surface-muted">
          Go to My Day
        </Link>
      </div>
    </Panel>
  );
}
