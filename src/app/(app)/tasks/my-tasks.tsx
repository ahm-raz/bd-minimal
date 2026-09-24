"use client";

import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, Panel, PanelHeader } from "@/components/common/page";
import { TaskRows } from "@/components/tasks/task-list";
import { formatLocalDate } from "@/lib/dates";
import type { TaskItem } from "@/server/queries/tasks";

/** BD view: read-only list of today, overdue and the next 7 days; checklist and lead-fix tasks can be ticked. */
export function MyTasks({ today, tasks }: { today: string; tasks: TaskItem[] }) {
  const overdue = tasks.filter((t) => t.status === "overdue");
  const todays = tasks.filter((t) => t.dueDate === today);
  const later = tasks.filter((t) => t.dueDate > today);
  return (
    <>
      <PageHeader title="Tasks" meta={formatLocalDate(today)} />
      <div className="flex flex-col gap-6">
        {overdue.length > 0 && (
          <Panel>
            <PanelHeader title="Overdue" meta={<span className="num text-bad">{overdue.length}</span>} />
            <TaskRows tasks={overdue} today={today} />
          </Panel>
        )}
        <Panel>
          <PanelHeader title="Today" meta={<span className="num">{todays.filter((t) => t.completedAt).length} of {todays.length} done</span>} />
          {todays.length === 0 ? <EmptyState>No tasks from the founder today.</EmptyState> : <TaskRows tasks={todays} today={today} />}
        </Panel>
        <Panel>
          <PanelHeader title="Next 7 days" />
          {later.length === 0 ? <EmptyState>Nothing assigned for the coming days yet.</EmptyState> : <TaskRows tasks={later} today={today} />}
        </Panel>
      </div>
    </>
  );
}
