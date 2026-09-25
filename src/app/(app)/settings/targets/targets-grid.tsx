"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Panel } from "@/components/common/page";
import { METRIC_LABELS, SOCIAL_TARGET_METRICS, TARGET_METRICS, type TargetMetric } from "@/lib/domain";
import { dailyTarget } from "@/lib/metrics";
import { formatNumber } from "@/lib/format";
import { saveTarget } from "@/server/actions/settings";
import type { MemberItem } from "@/server/queries/lists";

type Target = { user_id: string; metric: TargetMetric; weekly_value: number };

/** People × metrics of weekly numbers; saves on blur and shows the daily equivalent (docs/07 section 12). */
export function TargetsGrid({
  members,
  targets,
  highlight,
}: {
  members: MemberItem[];
  targets: Target[];
  highlight: string | null;
}) {
  const initial: Record<string, string> = {};
  for (const t of targets) initial[`${t.user_id}:${t.metric}`] = String(t.weekly_value);
  const [values, setValues] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const commit = (m: MemberItem, metric: TargetMetric) => {
    const key = `${m.id}:${metric}`;
    const raw = (values[key] ?? "").trim();
    if (raw === (saved[key] ?? "")) return;
    const weeklyValue = raw === "" ? null : Number(raw);
    if (weeklyValue !== null && (!Number.isInteger(weeklyValue) || weeklyValue < 0)) {
      setErrors((e) => ({ ...e, [key]: "Use a whole number, 0 or more." }));
      return;
    }
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
    startTransition(async () => {
      const res = await saveTarget({ userId: m.id, metric, weeklyValue });
      if (!res.ok) {
        setValues((v) => ({ ...v, [key]: saved[key] ?? "" }));
        toast.error(res.fieldErrors?.weeklyValue ?? res.error);
        return;
      }
      setSaved((s) => ({ ...s, [key]: raw }));
      toast.success("Target saved");
    });
  };

  return (
    <>
      <p className="prose-width mb-4 text-small text-ink-muted">
        Weekly numbers per person. The daily target is the weekly number divided by 5. Leave a cell empty for no target. Posts published applies to social media managers only.
      </p>
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                {TARGET_METRICS.map((metric) => (
                  <TableHead key={metric} className="text-right">
                    {METRIC_LABELS[metric]}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.id} className={cn("h-auto", highlight === m.id && "bg-accent-soft hover:bg-accent-soft")}>
                  <TableCell className="align-top font-medium">
                    <div className="pt-1.5">{m.full_name || m.email}</div>
                  </TableCell>
                  {TARGET_METRICS.map((metric) => {
                    const key = `${m.id}:${metric}`;
                    const raw = values[key] ?? "";
                    const n = Number(raw);
                    const error = errors[key];
                    // Sales targets are for the founder and BDs; Posts published is for social media managers.
                    const applies = (m.role === "social") === SOCIAL_TARGET_METRICS.includes(metric);
                    if (!applies) {
                      return (
                        <TableCell key={metric} className="text-right align-top">
                          <span className="inline-block pt-1.5 text-small text-ink-faint" aria-label="Not used for this role">
                            &ndash;
                          </span>
                        </TableCell>
                      );
                    }
                    return (
                      <TableCell key={metric} className="align-top">
                        <div className="ml-auto flex w-24 flex-col items-end gap-0.5">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            aria-label={`${m.full_name || m.email}: weekly ${METRIC_LABELS[metric].toLowerCase()}`}
                            aria-invalid={!!error}
                            value={raw}
                            className="num h-8 text-right"
                            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                            onBlur={() => commit(m, metric)}
                            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                          />
                          <span className="num text-micro font-normal text-ink-muted">
                            {error ? (
                              <span className="text-bad">{error}</span>
                            ) : raw !== "" && Number.isFinite(n) ? (
                              `${formatNumber(dailyTarget(n))} a day`
                            ) : (
                              " "
                            )}
                          </span>
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>
    </>
  );
}
