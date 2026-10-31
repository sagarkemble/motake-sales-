import { Skeleton } from "~/components/ui/skeleton";

export function CardDetailSkeleton() {
  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-col gap-2 rounded-2xl border bg-muted-faint p-3">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}
