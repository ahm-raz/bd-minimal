"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chip } from "@/components/common/chips";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel, PanelHeader } from "@/components/common/page";
import { useApp } from "@/components/app/app-provider";
import { TaskRows } from "@/components/tasks/task-list";
import { TaskSheet, type TaskSheetState } from "@/components/tasks/task-sheet";
import { METRIC_LABELS } from "@/lib/domain";
import { addDays, formatLocalDate, isWeekend } from "@/lib/dates";
import { stopTemplate } from "@/server/actions/tasks";
import type { TaskItem, TemplateItem } from "@/server/queries/tasks";

/** Founder Tasks page: pick a date, see each person's tasks, assign new ones, manage repeating tasks (docs/07 section 8). */
export function FounderTasks({
  date,
  today,
  tab,
  openNew,
  day,
  overdue,
  templates,
}: {
  date: string;
  today: string;
  tab: "day" | "repeating";
  openNew: boolean;
  day: TaskItem[];
  overdue: TaskItem[];
  templates: TemplateItem[];
}) {
  const { lists } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [sheet, setSheet] = useState<TaskSheetState | null>(openNew ? { mode: "new" } : null);
  const [, startTransition] = useTransition();

  // T while already on this page
  useEffect(() => {
    const open = () => setSheet({ mode: "new" });
    window.addEventListener("cao:new-task", open);
    return () => window.removeEventListener("cao:new-task", open);
  }, []);

  const setParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    next.delete("new");
    router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  };

  const people = lists.members.filter((m) => m.is_active || day.some((t) => t.assigneeId === m.id) || overdue.some((t) => t.assigneeId === m.id));
  const member = (id: string) => lists.members.find((m) => m.id === id);

  const editTask = (t: TaskItem) =>
    setSheet({
      mode: "edit",
      linkLabel: t.leadName ?? t.opportunityTitle,
      values: {
        id: t.id,
        assigneeId: t.assigneeId,
        kind: t.kind === "count" ? "count" : "checklist",
        title: t.title,
        metric: t.metric,
        targetCount: t.targetCount === null ? "" : String(t.targetCount),
        filterNicheId: null,
        filterCampaignId: null,
        leadId: t.leadId,
        opportunityId: t.opportunityId,
        note: t.note ?? "",
        dueDate: t.dueDate,
        repeat: false,
      },
    });

  return (
    <>
      <PageHeader
        title="Tasks"
        actions={
          <Button onClick={() => setSheet({ mode: "new" })}>
            <Plus aria-hidden /> Task <kbd className="ml-1 font-mono text-micro font-normal opacity-80">T</kbd>
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav aria-label="Tasks views" className="flex gap-1 border-b border-line">
          {(["day", "repeating"] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-current={tab === t ? "page" : undefined}
              onClick={() => setParams({ tab: t === "day" ? null : "repeating" })}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-body",
                tab === t ? "border-accent-strong font-medium text-accent-strong" : "border-transparent text-ink-muted hover:text-ink",
              )}
            >
              {t === "day" ? "By day" : "Repeating tasks"}
            </button>
          ))}
        </nav>
        {tab === "day" && (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="icon" aria-label="Previous day" onClick={() => setParams({ date: addDays(date, -1) })}>
              <ChevronLeft />
            </Button>
            <label htmlFor="task-date" className="sr-only">
              Date
            </label>
            <Input id="task-date" type="date" value={date} onChange={(e) => e.target.value && setParams({ date: e.target.value })} className="h-8 w-40" />
            <Button variant="secondary" size="icon" aria-label="Next day" onClick={() => setParams({ date: addDays(date, 1) })}>
              <ChevronRight />
            </Button>
            {date !== today && (
              <Button variant="ghost" onClick={() => setParams({ date: null })}>
                Today
              </Button>
            )}
          </div>
        )}
      </div>

      {tab === "day" ? (
        <div className="flex flex-col gap-4">
          <p className="text-small text-ink-muted">
            {formatLocalDate(date, today)}
            {isWeekend(date) && ". Repeating tasks skip weekends."}
          </p>
          {people.map((m) => {
            const mine = day.filter((t) => t.assigneeId === m.id);
            const late = overdue.filter((t) => t.assigneeId === m.id);
            const done = mine.filter((t) => t.completedAt).length;
            return (
              <Panel key={m.id} aria-label={`${m.full_name || m.email} tasks`} data-testid={`tasks-${m.full_name}`}>
                <PanelHeader
                  title={m.full_name || m.email}
                  meta={
                    <span className="num">
                      {done} of {mine.length} done
                    </span>
                  }
                />
                {mine.length === 0 && late.length === 0 ? (
                  <EmptyState
                    className="py-4"
                    action={
                      <Button variant="secondary" size="sm" onClick={() => setSheet({ mode: "new", defaults: { assigneeId: m.id, dueDate: date } })}>
                        Assign task
                      </Button>
                    }
                  >
                    No tasks for {m.full_name?.split(" ")[0] || "them"} on this day.
                  </EmptyState>
                ) : (
                  <>
                    <TaskRows tasks={mine} today={date} assigneeTz={m.timezone} onEdit={editTask} canManage />
                    {late.length > 0 && (
                      <>
                        <div className="border-t border-line bg-bad-soft/40 px-4 py-1.5 text-small font-medium text-bad">Still overdue</div>
                        <TaskRows tasks={late} today={date} assigneeTz={m.timezone} onEdit={editTask} canManage />
                      </>
                    )}
                  </>
                )}
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel className="overflow-hidden">
          {templates.length === 0 ? (
            <EmptyState action={<Button onClick={() => setSheet({ mode: "new", defaults: { repeat: true } })}>New repeating task</Button>}>
              No repeating tasks yet. Turn on Repeat on weekdays when you assign one.
            </EmptyState>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Counts</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-48">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((t) => (
                  <TableRow key={t.id} data-testid={`template-${t.title}`}>
                    <TableCell>{member(t.assigneeId)?.full_name}</TableCell>
                    <TableCell className="font-medium">{t.title}</TableCell>
                    <TableCell className="num text-ink-muted">
                      {t.kind === "count" && t.metric ? `${METRIC_LABELS[t.metric]}, ${t.targetCount}` : "Checklist"}
                    </TableCell>
                    <TableCell className="num text-ink-muted">{formatLocalDate(t.startsOn, today)}</TableCell>
                    <TableCell>{t.isActive ? <Chip tone="ok">Active</Chip> : <Chip>Stopped</Chip>}</TableCell>
                    <TableCell className="text-right">
                      {t.isActive && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSheet({
                                mode: "template",
                                values: {
                                  templateId: t.id,
                                  assigneeId: t.assigneeId,
                                  kind: t.kind,
                                  title: t.title,
                                  metric: t.metric,
                                  targetCount: t.targetCount === null ? "" : String(t.targetCount),
                                  filterNicheId: t.filterNicheId,
                                  filterCampaignId: t.filterCampaignId,
                                  note: t.note ?? "",
                                  dueDate: t.startsOn,
                                  repeat: true,
                                },
                              })
                            }
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              startTransition(async () => {
                                const res = await stopTemplate({ id: t.id });
                                if (!res.ok) toast.error(res.error);
                                else {
                                  toast.success("Stopped repeating");
                                  router.refresh();
                                }
                              })
                            }
                          >
                            Stop repeating
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      )}

      {sheet && <TaskSheet state={sheet} defaultDate={date} onClose={() => setSheet(null)} />}
    </>
  );
}
