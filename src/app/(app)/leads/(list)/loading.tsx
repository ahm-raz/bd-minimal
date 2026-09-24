import { Skeleton } from "@/components/ui/skeleton";

export default function LeadsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading leads">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-8 w-80" />
      </div>
      <div className="rounded-lg border border-line bg-surface">
        <Skeleton className="h-9 w-full rounded-none rounded-t-lg" />
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex h-10 items-center gap-4 border-t border-line px-3">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
