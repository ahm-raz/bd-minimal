"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Building2,
  ChevronsUpDown,
  Columns3,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  Settings,
  Sun,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type Role } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useProfile } from "./profile-provider";

type NavItem = { href: string; label: string; icon: LucideIcon; roles: Role[]; shortcut?: string };

const ALL: Role[] = ["founder", "bd", "social"];

/** Navigation per role (docs/07 section 1, docs/09 section 1). */
const NAV: NavItem[] = [
  { href: "/my-day", label: "My Day", icon: Sun, roles: ALL, shortcut: "G M" },
  { href: "/leads", label: "Leads", icon: Building2, roles: ["founder", "bd"], shortcut: "G L" },
  { href: "/pipeline", label: "Pipeline", icon: Columns3, roles: ["founder", "bd"], shortcut: "G P" },
  { href: "/content", label: "Content", icon: Megaphone, roles: ["founder", "social"], shortcut: "G C" },
  { href: "/tasks", label: "Tasks", icon: ListChecks, roles: ALL },
  { href: "/feed", label: "Feed", icon: Activity, roles: ["founder"] },
  { href: "/performance", label: "Performance", icon: BarChart3, roles: ALL },
  { href: "/team", label: "Team", icon: Users, roles: ["founder"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["founder"] },
];

export function navFor(role: Role) {
  return NAV.filter((n) => n.roles.includes(role));
}

function NavLinks({ onNavigate, reviewCount }: { onNavigate?: () => void; reviewCount: number }) {
  const pathname = usePathname();
  const { role } = useProfile();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
      {navFor(role).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-body transition-colors",
              active ? "bg-accent-soft font-medium text-accent-strong" : "text-ink hover:bg-surface-muted",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">{item.label}</span>
            {item.href === "/content" && reviewCount > 0 && (
              <span
                className="num rounded-full bg-warn-soft px-1.5 text-micro font-medium text-warn-ink"
                data-testid="nav-review-count"
              >
                {reviewCount}
                <span className="sr-only"> need review</span>
              </span>
            )}
            {item.shortcut && (
              <kbd className="hidden font-mono text-micro font-normal text-ink-muted lg:inline">{item.shortcut}</kbd>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function UserMenu() {
  const { fullName, role, timezone } = useProfile();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-muted"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-medium text-ink">{fullName || "You"}</span>
            <span className="block truncate text-small text-ink-muted">
              {ROLE_LABELS[role]}, {timezone.replace(/_/g, " ")}
            </span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-muted" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
        <DropdownMenuItem asChild>
          <Link href="/profile">
            <UserRound aria-hidden /> Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await fetch("/auth/signout", { method: "POST", redirect: "manual" });
            router.replace("/login");
            router.refresh();
          }}
        >
          <LogOut aria-hidden /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 232px sidebar (docs/06 section 4). Below 1024px it becomes a top bar with a menu button. */
export function Sidebar({ reviewCount = 0 }: { reviewCount?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="hidden w-[232px] shrink-0 border-r border-line bg-surface lg:block">
        <aside className="sticky top-0 flex h-screen flex-col">
          <div className="px-5 pt-5 pb-4 text-section text-ink">Client Acquisition OS</div>
          <div className="flex-1 overflow-y-auto">
            <NavLinks reviewCount={reviewCount} />
          </div>
          <div className="border-t border-line p-3">
            <UserMenu />
          </div>
        </aside>
      </div>

      <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-line bg-surface px-3 lg:hidden">
        <Button variant="ghost" size="icon" aria-label="Open menu" onClick={() => setOpen(true)}>
          <Menu />
        </Button>
        <span className="text-section text-ink">Client Acquisition OS</span>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[272px] gap-0 p-0 sm:max-w-[272px]">
          <SheetTitle className="px-5 pt-5 pb-4">Client Acquisition OS</SheetTitle>
          <div className="flex-1 overflow-y-auto">
            <NavLinks onNavigate={() => setOpen(false)} reviewCount={reviewCount} />
          </div>
          <div className="border-t border-line p-3">
            <UserMenu />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
