import { Skeleton } from "~/components/ui/skeleton";

interface GridItemSkeletonProps {
  count?: number;
}

export function GridItemSkeleton({ count = 6 }: GridItemSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-8 w-full rounded-full" />
        </div>
      ))}
    </>
  );
}
