"use client";

import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A thin accent bar at the top of the window while the page is fetching new data for a filter, range or
 * date change (docs/06 section 7). Pages use `useFilterNav()` instead of `router.replace` so the old
 * results can dim and the bar shows; route changes already get their loading.tsx skeletons.
 */
const ReportContext = createContext<(delta: 1 | -1) => void>(() => {});

export function NavProgressProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(0);
  const report = useCallback((delta: 1 | -1) => setActive((n) => Math.max(0, n + delta)), []);
  return (
    <ReportContext.Provider value={report}>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden transition-opacity duration-200",
          // A short delay, so quick responses never flash the bar.
          active > 0 ? "opacity-100 delay-150" : "opacity-0",
        )}
      >
        {active > 0 && <div className="h-full w-full origin-left animate-progress bg-accent-strong" />}
      </div>
      {children}
    </ReportContext.Provider>
  );
}

/** `replace(url)` updates the URL in a transition; `pending` is true until the new data has rendered. */
export function useFilterNav() {
  const router = useRouter();
  const pathname = usePathname();
  const report = useContext(ReportContext);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!pending) return;
    report(1);
    return () => report(-1);
  }, [pending, report]);
  const replace = useCallback(
    (url: string) => startTransition(() => router.replace(url, { scroll: false })),
    [router],
  );
  /** Replace the query string of the current page ("" clears it). */
  const replaceQuery = useCallback(
    (params: URLSearchParams) => replace(params.size ? `${pathname}?${params}` : pathname),
    [replace, pathname],
  );
  return { pending, replace, replaceQuery };
}

/** Wrap results that are being refetched: dims them and tells assistive tech they're busy. */
export function BusyRegion({
  busy,
  className,
  ...props
}: React.ComponentProps<"div"> & { busy: boolean }) {
  return (
    <div
      aria-busy={busy || undefined}
      className={cn("transition-opacity duration-200", busy && "opacity-60", className)}
      {...props}
    />
  );
}
