"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/** Founder only: Sales / Social switch; the range and person stay in the URL. */
export function PerformanceTabs({ active }: { active: "sales" | "social" }) {
  const params = useSearchParams();
  const href = (tab: "sales" | "social") => {
    const next = new URLSearchParams(params.toString());
    next.delete("person");
    if (tab === "social") next.set("tab", "social");
    else next.delete("tab");
    return next.size ? `/performance?${next}` : "/performance";
  };
  return (
    <nav aria-label="Performance" className="mb-4 flex gap-1 border-b border-line">
      {(["sales", "social"] as const).map((t) => (
        <Link
          key={t}
          href={href(t)}
          aria-current={active === t ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-body transition-colors",
            active === t ? "border-accent-strong font-medium text-accent-strong" : "border-transparent text-ink-muted hover:text-ink",
          )}
        >
          {t === "sales" ? "Sales" : "Social"}
        </Link>
      ))}
    </nav>
  );
}
