import { Skeleton } from "~/components/ui/skeleton";

interface ListItemSkeletonProps {
  count?: number;
}

export function ListItemSkeleton({ count = 5 }: ListItemSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex items-center gap-3 rounded-2xl border bg-card shadow-sm p-3"
        >
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </>
  );
}
