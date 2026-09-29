import { Skeleton } from "@/components/ui/skeleton";

type Shape = "table" | "board" | "cards" | "detail";

/**
 * Loading state shaped like the page that's coming (docs/06: skeletons, never full-page spinners),
 * so nothing jumps when the data arrives. Screen readers hear the label once.
 */
export function PageSkeleton({ label, rows = 8, shape = "table" }: { label: string; rows?: number; shape?: Shape }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="animate-enter">
      <span className="sr-only">{label}</span>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-8 w-28" />
      </div>
      {shape === "table" && <TableRows rows={rows} />}
      {shape === "board" && (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }, (_, c) => (
            <div key={c} className="w-64 shrink-0 space-y-2 rounded-lg border border-line bg-surface p-2 shadow-card">
              <Skeleton className="h-5 w-24" />
              {Array.from({ length: 3 - (c % 2) }, (_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ))}
        </div>
      )}
      {shape === "cards" && (
        <div className="space-y-6">
          <Skeleton className="h-28 w-full rounded-lg" />
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-56 w-full rounded-lg" />
            <Skeleton className="h-56 w-full rounded-lg" />
          </div>
          <TableRows rows={Math.min(rows, 5)} />
        </div>
      )}
      {shape === "detail" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <Skeleton className="h-36 w-full rounded-lg" />
            <Skeleton className="h-72 w-full rounded-lg" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}

function TableRows({ rows }: { rows: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <div className="h-9 border-b border-line bg-surface-muted" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-11 items-center gap-4 border-t border-line px-3 first:border-t-0">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="hidden h-4 w-56 sm:block" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Rows loading inside a panel or popover: two text lines per row, announced once. */
export function ListSkeleton({ label = "Loading", rows = 4 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-line">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2 px-4 py-3">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
