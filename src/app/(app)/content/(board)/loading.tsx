import { Skeleton } from "@/components/ui/skeleton";

export default function ContentLoading() {
  return (
    <div aria-busy="true" aria-label="Loading content">
      <div className="mb-6 flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-8 w-72" />
      </div>
      <Skeleton className="mb-4 h-9 w-full" />
      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
