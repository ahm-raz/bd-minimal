import { Skeleton } from "@/components/ui/skeleton";

export default function MyDayLoading() {
  return (
    <div aria-busy="true" aria-label="Loading My Day">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="mb-6 h-28 w-full rounded-lg" />
      <div className="rounded-lg border border-line bg-surface">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex h-12 items-center gap-4 border-b border-line px-4 last:border-0">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-7 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}
