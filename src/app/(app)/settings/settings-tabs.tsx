"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { pathInDepartment } from "@/lib/department";
import { useApp } from "@/components/app/app-provider";

const TABS = [
  { href: "/settings/lists", label: "Lists" },
  { href: "/settings/activity-types", label: "Activity types" },
  { href: "/settings/outcomes", label: "Outcomes and stages" },
  { href: "/settings/campaigns", label: "Campaigns" },
  { href: "/settings/targets", label: "Targets" },
  { href: "/settings/social-accounts", label: "Social accounts" },
  { href: "/settings/pillars", label: "Content pillars" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const { department } = useApp();
  return (
    <nav aria-label="Settings" className="flex gap-1 overflow-x-auto border-b border-line">
      {TABS.filter((t) => pathInDepartment(t.href, department)).map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-body whitespace-nowrap transition-colors",
              active
                ? "border-accent-strong font-medium text-accent-strong"
                : "border-transparent text-ink-muted hover:text-ink",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
