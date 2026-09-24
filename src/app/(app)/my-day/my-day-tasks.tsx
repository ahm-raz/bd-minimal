"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common/empty-state";
import { Panel, PanelHeader } from "@/components/common/page";
import { useProfile } from "@/components/app/profile-provider";
import { TaskRows } from "@/components/tasks/task-list";
import type { TaskItem } from "@/server/queries/tasks";

/** My Day tasks block: overdue first, then today's; done ones collapse into "3 done today" (docs/07 section 2). */
export function MyDayTasks({ today, tasks, founderName }: { today: string; tasks: TaskItem[]; founderName: string }) {
  const { role } = useProfile();
  const [showDone, setShowDone] = useState(false);
  const overdue = tasks.filter((t) => t.status === "overdue");
  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");
  const title = role === "founder" ? "Your tasks" : `Tasks from ${founderName}`;

  return (
    <Panel className="mb-6" aria-label="Tasks">
      <PanelHeader title={title} meta={<span className="num">{overdue.length + open.length} open</span>} />
      {tasks.length === 0 ? (
        <EmptyState>No tasks from the founder today.</EmptyState>
      ) : (
        <>
          <TaskRows tasks={[...overdue, ...open]} today={today} />
          {done.length > 0 && (
            <div className="border-t border-line">
              <button
                type="button"
                aria-expanded={showDone}
                onClick={() => setShowDone((v) => !v)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-small text-ink-muted hover:bg-surface-muted"
              >
                <ChevronDown className={cn("size-4 transition-transform", !showDone && "-rotate-90")} aria-hidden />
                <span className="num">{done.length} done today</span>
              </button>
              {showDone && <TaskRows tasks={done} today={today} />}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
