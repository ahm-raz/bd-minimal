"use client";

import { NotificationBell } from "@/components/notifications/bell";
import { useState } from "react";
import Link, { useLinkStatus } from "next/link";
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
import { THEMES, THEME_LABELS, readTheme, saveTheme, type Theme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useProfile } from "./profile-provider";
import { useApp } from "./app-provider";
import { DepartmentSwitcher } from "./department-switcher";
import { pathInDepartment, type Department } from "@/lib/department";

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

/** The role's pages, minus the other department's when the founder views one department. */
export function navFor(role: Role, department: Department = "all") {
  return NAV.filter((n) => n.roles.includes(role) && pathInDepartment(n.href, department));
}

function NavLinks({ onNavigate, reviewCount }: { onNavigate?: () => void; reviewCount: number }) {
  const pathname = usePathname();
  const { role } = useProfile();
  const { department } = useApp();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 px-3">
      {navFor(role, department).map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-8 items-center gap-2.5 rounded-md px-2.5 text-body transition-colors duration-150 pointer-coarse:h-10",
              active
                ? "bg-accent-soft font-medium text-accent-strong before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r-full before:bg-accent-strong before:animate-in before:fade-in before:duration-200"
                : "text-ink-muted hover:bg-surface-muted hover:text-ink",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <NavPending />
            <span className="flex-1">{item.label}</span>
            {item.href === "/content" && reviewCount > 0 && (
              <span
                className="rounded-full bg-warn-soft px-1.5 num text-micro font-medium text-warn-ink"
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

function BrandMark() {
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-strong font-display text-small font-semibold text-on-accent"
    >
      C
    </span>
  );
}

/** While a nav link's page is loading, a small dot pulses next to its icon. */
function NavPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "absolute top-1/2 left-1 size-1.5 -translate-y-1/2 rounded-full bg-accent-strong transition-opacity",
        pending ? "animate-pulse opacity-100 delay-100" : "opacity-0",
      )}
    />
  );
}

/** Light / dark / system, remembered per browser (cookie). "Same as system" is pure CSS, so it follows OS changes live. */
function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  const choose = (t: Theme) => {
    saveTheme(t);
    setTheme(t);
  };
  return [theme, choose] as const;
}

function UserMenu() {
  const { fullName, role, timezone } = useProfile();
  const router = useRouter();
  const [theme, setTheme] = useTheme();
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
        <DropdownMenuLabel className="text-small font-normal text-ink-muted">Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {THEMES.map((t) => (
            <DropdownMenuRadioItem key={t} value={t}>
              {THEME_LABELS[t]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
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
          <div className="flex items-center justify-between gap-2 pt-4 pr-3 pb-3 pl-5">
            <span className="truncate text-section text-ink">Client Acquisition OS</span>
            <NotificationBell />
          </div>
          <DepartmentSwitcher className="mx-3 mb-3 w-auto" />
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
        <span className="flex flex-1 items-center gap-2 text-section text-ink">
          <BrandMark />
          <span className="truncate">Client Acquisition OS</span>
        </span>
        <NotificationBell />
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[272px] gap-0 p-0 sm:max-w-[272px]">
          <SheetTitle className="px-5 pt-5 pb-4">Client Acquisition OS</SheetTitle>
          <DepartmentSwitcher className="mx-3 mb-3 w-auto" />
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
