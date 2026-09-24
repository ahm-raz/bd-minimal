"use client";

import { RelativeTime } from "@/components/common/relative-time";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/common/empty-state";
import { FormSheet } from "@/components/common/form-sheet";
import { useApp } from "@/components/app/app-provider";
import { useProfile } from "@/components/app/profile-provider";
import { formatMoney, formatNumber, initials } from "@/lib/format";
import { drilldown, type DrillInput, type DrillRow } from "@/server/actions/drilldown";

export type DrillRequest = DrillInput & { label: string };

/** Side panel listing the records behind a number (docs/05 section 8). */
export function DrilldownSheet({ request, onClose }: { request: DrillRequest | null; onClose: () => void }) {
  if (!request) return null;
  return <DrilldownBody key={JSON.stringify(request)} request={request} onClose={onClose} />;
}

function DrilldownBody({ request, onClose }: { request: DrillRequest; onClose: () => void }) {
  const { lists } = useApp();
  const { timezone } = useProfile();
  const [rows, setRows] = useState<DrillRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const member = (id: string | null) => lists.members.find((m) => m.id === id)?.full_name ?? "";

  useEffect(() => {
    let live = true;
    const { label: _label, ...input } = request;
    void _label;
    void drilldown(input).then((res) => {
      if (!live) return;
      if (res.ok) setRows(res.data);
      else setError(res.error);
    });
    return () => {
      live = false;
    };
  }, [request]);

  return (
    <FormSheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={request.label}
      description={rows ? `${formatNumber(rows.length)} ${rows.length === 1 ? "record" : "records"}` : "Loading"}
      bodyClassName="px-0 py-0"
    >
      {error ? (
        <ErrorState>{error} Close the panel and try again.</ErrorState>
      ) : !rows ? (
        <div className="flex flex-col gap-3 p-5" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState>Nothing here for this period.</EmptyState>
      ) : (
        <ul className="divide-y divide-line" data-testid="drilldown-rows">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-5 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/leads/${r.leadId}`} className="font-medium text-ink hover:underline" onClick={onClose}>
                  {r.company}
                </Link>
                <div className="text-small text-ink-muted">{r.title}</div>
                {r.detail && <div className="truncate text-small text-ink-muted">{r.detail}</div>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                {r.value !== undefined && r.value !== null && (
                  <span className="num text-body">{formatMoney(r.value)}</span>
                )}
                <RelativeTime at={r.at} tz={timezone} className="num text-small text-ink-muted" />
                {r.userId && (
                  <span className="num text-micro text-ink-muted" title={member(r.userId)}>
                    {initials(member(r.userId))}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </FormSheet>
  );
}
