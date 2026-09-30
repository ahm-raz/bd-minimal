"use client";

import { useTransition } from "react";
import { useRouter } from "@/components/app/nav-progress";
import { ChevronsUpDown, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEPARTMENTS, DEPARTMENT_LABELS, saveDepartment, type Department } from "@/lib/department";
import { useApp } from "./app-provider";
import { useProfile } from "./profile-provider";

/** Founder only: show the whole app for All departments, Sales or Social media (remembered per browser). */
export function DepartmentSwitcher({ className }: { className?: string }) {
  const { role } = useProfile();
  const { department } = useApp();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (role !== "founder") return null;

  const choose = (d: Department) => {
    if (d === department) return;
    saveDepartment(d);
    startTransition(() => router.refresh());
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left text-small text-ink hover:bg-surface-muted",
          pending && "opacity-60",
          className,
        )}
        aria-label={`Department: ${DEPARTMENT_LABELS[department]}`}
        data-testid="department-switcher"
      >
        <Layers className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{DEPARTMENT_LABELS[department]}</span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-ink-faint" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Show the app for</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={department} onValueChange={(v) => choose(v as Department)}>
          {DEPARTMENTS.map((d) => (
            <DropdownMenuRadioItem key={d} value={d}>
              {DEPARTMENT_LABELS[d]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
