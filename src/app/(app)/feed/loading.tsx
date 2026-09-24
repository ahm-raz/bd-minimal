import { Skeleton } from "@/components/ui/skeleton";

export default function FeedLoading() {
  return (
    <div aria-busy="true" aria-label="Loading feed">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="rounded-lg border border-line bg-surface">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="flex h-12 items-center gap-3 border-b border-line px-4 last:border-0">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-4 w-96" />
          </div>
        ))}
      </div>
    </div>
  );
}
