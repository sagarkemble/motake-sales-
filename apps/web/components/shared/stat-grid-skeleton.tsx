import { Skeleton } from "~/components/ui/skeleton";

interface StatGridSkeletonProps {
  count?: number;
}

export function StatGridSkeleton({ count = 6 }: StatGridSkeletonProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-12" />
        </div>
      ))}
    </div>
  );
}
