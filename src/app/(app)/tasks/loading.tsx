import { Skeleton } from "@/components/ui/skeleton";

export default function TasksLoading() {
  return (
    <div aria-busy="true" aria-label="Loading tasks">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-8 w-48" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="mb-4 rounded-lg border border-line bg-surface">
          <Skeleton className="h-11 w-full rounded-none rounded-t-lg" />
          {Array.from({ length: 3 }, (_, j) => (
            <div key={j} className="flex h-11 items-center gap-4 border-t border-line px-4">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="ml-auto h-2 w-40" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
