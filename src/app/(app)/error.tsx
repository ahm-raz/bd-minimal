"use client";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/common/page";

/** Error boundary for app pages: says what happened and what to do (docs/06 section 7). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel role="alert" className="mx-auto mt-12 max-w-md p-6">
      <h1 className="text-title text-ink">This page didn&apos;t load</h1>
      <p className="mt-2 text-body text-ink-muted">
        The data couldn&apos;t be read just now. Try again. If it keeps happening, check that Supabase is running
        and you&apos;re still signed in.
      </p>
      {error.digest && <p className="mt-2 font-mono text-micro text-ink-muted">Reference {error.digest}</p>}
      <div className="mt-4 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" asChild>
          <a href="/auth/signout">Sign in again</a>
        </Button>
      </div>
    </Panel>
  );
}
