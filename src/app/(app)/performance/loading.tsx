import { Skeleton } from "@/components/ui/skeleton";

export default function PerformanceLoading() {
  return (
    <div aria-busy="true" aria-label="Loading performance">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-8 w-80" />
      </div>
      <Skeleton className="mb-6 h-44 w-full rounded-lg" />
      <Skeleton className="mb-6 h-64 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}
