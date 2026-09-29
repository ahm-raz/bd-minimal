"use client";

import { Button } from "@/components/ui/button";

/** Sign-in pages: a failure that isn't a form error (the page itself didn't load). */
export default function AuthError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3">
      <h1 className="text-title text-ink">This page didn&apos;t load</h1>
      <p className="text-body text-ink-muted">Check your connection and try again.</p>
      <div className="flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" asChild>
          <a href="/login">Go to sign in</a>
        </Button>
      </div>
    </div>
  );
}
