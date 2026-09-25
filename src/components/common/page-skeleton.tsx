import { Skeleton } from "@/components/ui/skeleton";

/** Generic loading state: title bar plus table-like rows (docs/06: skeletons, never full-page spinners). */
export function PageSkeleton({ label, rows = 8 }: { label: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-label={label}>
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-8 w-28" />
      </div>
      <div className="rounded-lg border border-line bg-surface">
        <Skeleton className="h-9 w-full rounded-none rounded-t-lg" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-10 items-center gap-4 border-t border-line px-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
