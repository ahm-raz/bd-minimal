"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Flag, MoreHorizontal, Repeat } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Chip } from "@/components/common/chips";
import { PaceBar } from "@/components/common/pace-bar";
import { useProfile } from "@/components/app/profile-provider";
import { dueLabel, weekdayShort } from "@/lib/dates";
import { dayPaceMarker } from "@/lib/metrics";
import { useNow } from "@/lib/use-now";
import { CLEANUP_TITLE, STUCK_TITLE } from "@/lib/validation/task";
import { deleteTask, setTaskDone, taskHelperList, type TaskHelperList } from "@/server/actions/tasks";
import type { TaskItem } from "@/server/queries/tasks";

/**
 * Task rows (docs/07 sections 2 and 8). Count tasks show a pace bar and x/y with no checkbox;
 * checklist and lead-fix tasks have a checkbox (optimistic, rolled back on error), linked record and note.
 */
export function TaskRows({
  tasks,
  today,
  assigneeTz,
  onEdit,
  canManage = false,
}: {
  tasks: TaskItem[];
  today: string;
  assigneeTz?: string;
  onEdit?: (t: TaskItem) => void;
  canManage?: boolean;
}) {
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  const [synced, setSynced] = useState(tasks);
  if (synced !== tasks) {
    setSynced(tasks);
    setOptimistic({});
  }
  const router = useRouter();
  const [, startTransition] = useTransition();

  const toggle = (t: TaskItem, done: boolean) => {
    setOptimistic((o) => ({ ...o, [t.id]: done }));
    startTransition(async () => {
      const res = await setTaskDone({ id: t.id, done });
      if (!res.ok) {
        setOptimistic((o) => {
          const n = { ...o };
          delete n[t.id];
          return n;
        });
        toast.error(res.error);
        return;
      }
      toast.success(done ? "Task done" : "Task reopened");
      router.refresh();
    });
  };

  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => (
        <TaskRow
          key={t.id}
          t={t}
          today={today}
          assigneeTz={assigneeTz}
          done={optimistic[t.id] ?? !!t.completedAt}
          onToggle={(done) => toggle(t, done)}
          onEdit={onEdit}
          canManage={canManage}
        />
      ))}
    </ul>
  );
}

function TaskRow({
  t,
  today,
  assigneeTz,
  done,
  onToggle,
  onEdit,
  canManage,
}: {
  t: TaskItem;
  today: string;
  assigneeTz?: string;
  done: boolean;
  onToggle: (done: boolean) => void;
  onEdit?: (t: TaskItem) => void;
  canManage: boolean;
}) {
  const profile = useProfile();
  const router = useRouter();
  const now = useNow();
  const [expanded, setExpanded] = useState(false);
  const [helper, setHelper] = useState<TaskHelperList | null>(null);
  const [, startTransition] = useTransition();
  const overdue = !done && t.status === "overdue";
  const helperKind = t.title.startsWith(CLEANUP_TITLE()) ? "cleanup" : t.title.startsWith(STUCK_TITLE()) ? "stuck" : null;
  const expandable = t.kind !== "count" && (!!t.note || !!helperKind);

  const expand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && helperKind && !helper) {
      void taskHelperList({ assigneeId: t.assigneeId, kind: helperKind }).then((r) => r.ok && setHelper(r.data));
    }
  };

  return (
    <li className="px-4 py-2.5" data-testid={`task-${t.title}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {t.kind === "count" ? (
          <span className="size-4 shrink-0" aria-hidden />
        ) : (
          <Checkbox
            checked={done}
            onCheckedChange={(v) => onToggle(!!v)}
            aria-label={`${done ? "Reopen" : "Mark done"}: ${t.title}`}
          />
        )}
        {t.kind === "lead_fix" && <Flag className="size-3.5 shrink-0 text-bad" aria-label="Lead fix" />}
        <span className={cn("min-w-40 flex-1 truncate text-body", done ? "text-ink-muted line-through" : "text-ink")}>{t.title}</span>

        {t.kind === "count" && t.targetCount !== null && (
          <div className="flex w-full items-center gap-2 sm:w-64">
            <PaceBar
              compact
              actual={t.progress ?? 0}
              target={t.targetCount}
              pace={t.dueDate === today && !done && now ? dayPaceMarker(t.targetCount, assigneeTz ?? profile.timezone, now) : null}
              label={t.title}
              className="flex-1"
            />
            <span className="num w-14 text-right text-small text-ink" data-testid="task-progress">
              {t.progress ?? 0}/{t.targetCount}
            </span>
          </div>
        )}
        {(t.leadId || t.opportunityId) && (
          <Link href={`/leads/${t.leadId ?? ""}`} className="max-w-48 truncate text-small text-accent-strong hover:underline">
            {t.leadName ?? t.opportunityTitle}
          </Link>
        )}
        {t.isRecurring && (
          <Chip>
            <Repeat className="size-3" aria-hidden /> Repeats
          </Chip>
        )}
        {done ? (
          <Chip tone="ok">{t.onTime === false ? "Done late" : "Done"}</Chip>
        ) : overdue ? (
          <Chip tone="bad">Overdue since {weekdayShort(t.dueDate)}</Chip>
        ) : t.dueDate !== today ? (
          <span className="num text-small text-ink-muted">{dueLabel(t.dueDate, today)}</span>
        ) : t.kind !== "count" ? (
          <span className="text-small text-warn">Due today</span>
        ) : null}
        {expandable && (
          <Button variant="ghost" size="icon-xs" aria-expanded={expanded} aria-label={expanded ? "Hide details" : "Show details"} onClick={expand}>
            <ChevronDown className={cn("transition-transform", !expanded && "-rotate-90")} />
          </Button>
        )}
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label={`Actions for ${t.title}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && <DropdownMenuItem onSelect={() => onEdit(t)}>Edit</DropdownMenuItem>}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  startTransition(async () => {
                    const res = await deleteTask({ id: t.id });
                    if (!res.ok) toast.error(res.error);
                    else {
                      toast.success("Task deleted");
                      router.refresh();
                    }
                  })
                }
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {expanded && (
        <div className="mt-2 ml-7 flex flex-col gap-2 text-small text-ink-muted">
          {t.note && <p className="whitespace-pre-line">{t.note}</p>}
          {helperKind &&
            (helper === null ? (
              <p>Loading the list…</p>
            ) : helper.length === 0 ? (
              <p>{helperKind === "cleanup" ? "Every open lead has a next action." : "No deals stuck for 14 days or more."}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {helper.map((h) => (
                  <li key={h.id}>
                    <Link href={h.href} className="text-accent-strong hover:underline">
                      {h.label}
                    </Link>
                  </li>
                ))}
              </ul>
            ))}
        </div>
      )}
    </li>
  );
}
