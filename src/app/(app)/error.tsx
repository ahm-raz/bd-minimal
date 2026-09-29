"use client";

import Link from "next/link";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/common/page";

/** Error boundary for app pages: says what happened and what to do next (docs/06 section 7). */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Panel role="alert" className="mx-auto mt-12 max-w-md animate-enter p-6">
      <h1 className="text-title text-ink">This page didn&apos;t load</h1>
      <p className="mt-2 text-body text-ink-muted">
        Something went wrong while loading it. Try again; if it keeps happening, go back to My Day or sign in
        again.
      </p>
      {error.digest && <p className="mt-2 font-mono text-micro text-ink-muted">Reference {error.digest}</p>}
      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={reset}>
          <RotateCw aria-hidden /> Try again
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/my-day">Go to My Day</Link>
        </Button>
        <Button variant="ghost" asChild>
          <a href="/auth/signout">Sign in again</a>
        </Button>
      </div>
    </Panel>
  );
}
