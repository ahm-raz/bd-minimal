"use client";

import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter as useNextRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * A thin accent bar at the top of the window whenever the app is waiting on the server (docs/06 section 7):
 * any in-app link click, `useRouter()` push/replace/refresh from this module, and filter changes via
 * `useFilterNav()` (which also dims the old results). Route changes also get their loading.tsx skeletons.
 */
const ReportContext = createContext<(delta: 1 | -1) => void>(() => {});

/** Longest a link click keeps the bar on if the URL never changes (e.g. the server redirected back). */
const CLICK_TIMEOUT_MS = 10_000;

export function NavProgressProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(0);
  const [clicked, setClicked] = useState(false);
  const report = useCallback((delta: 1 | -1) => setActive((n) => Math.max(0, n + delta)), []);

  // Link clicks: start at once, stop when the URL changes (NavDone) or after a timeout.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // same page or #hash
      setClicked(true);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  useEffect(() => {
    if (!clicked) return;
    const t = setTimeout(() => setClicked(false), CLICK_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [clicked]);
  const done = useCallback(() => setClicked(false), []);

  const on = active > 0 || clicked;
  return (
    <ReportContext.Provider value={report}>
      <div
        aria-hidden
        data-testid="nav-progress"
        data-active={on || undefined}
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] overflow-hidden bg-accent-soft/60 transition-opacity duration-200",
          // A short delay, so quick responses never flash the bar.
          on ? "opacity-100 delay-100" : "opacity-0",
        )}
      >
        {on && <div className="h-full w-full origin-left animate-progress bg-accent-strong" />}
      </div>
      <Suspense fallback={null}>
        <NavDone onChange={done} />
      </Suspense>
      {children}
    </ReportContext.Provider>
  );
}

/** Calls `onChange` whenever the path or query string changes, i.e. a navigation has rendered. */
function NavDone({ onChange }: { onChange: () => void }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    onChange();
  }, [pathname, search, onChange]);
  return null;
}

/** Keeps the bar on while `pending` is true. */
function useReportPending(pending: boolean) {
  const report = useContext(ReportContext);
  useEffect(() => {
    if (!pending) return;
    report(1);
    return () => report(-1);
  }, [pending, report]);
}

/**
 * Drop-in for next/navigation's `useRouter`: push, replace, refresh and back run in a transition,
 * so the progress bar shows until the new data has rendered. The returned object is as stable as
 * Next's own router, so it's safe in effect dependencies.
 */
export function useRouter() {
  const router = useNextRouter();
  const [pending, startTransition] = useTransition();
  useReportPending(pending);
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => startTransition(() => router.push(...args)),
      replace: (...args: Parameters<typeof router.replace>) => startTransition(() => router.replace(...args)),
      refresh: () => startTransition(() => router.refresh()),
      back: () => startTransition(() => router.back()),
    }),
    [router],
  );
}

/** `replace(url)` updates the URL in a transition; `pending` is true until the new data has rendered. */
export function useFilterNav() {
  const router = useNextRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  useReportPending(pending);
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
