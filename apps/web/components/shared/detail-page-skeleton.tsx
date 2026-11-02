import { Skeleton } from "~/components/ui/skeleton";

export function DetailPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-40" />
      </div>

      <div className="flex items-center justify-between rounded-2xl border bg-card shadow-sm p-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border bg-card shadow-sm p-4">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
