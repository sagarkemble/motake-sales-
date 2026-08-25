import { Skeleton } from "~/components/ui/skeleton";

export function PageSplashSkeleton() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-4">
      <Skeleton className="size-10 rounded-full" />
      <Skeleton className="h-3 w-32" />
    </main>
  );
}
