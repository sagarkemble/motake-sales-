import { Loader2Icon } from "lucide-react";

import { cn } from "~/lib/utils";

interface LoadingStateProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const paddingBySize: Record<NonNullable<LoadingStateProps["size"]>, string> = {
  sm: "py-4",
  md: "py-6",
  lg: "py-8",
};

export function LoadingState({ label = "Loading", size = "md", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3",
        paddingBySize[size],
        className,
      )}
    >
      <Loader2Icon className="size-5 animate-spin text-brand" />
      <div className="h-1 w-28 overflow-hidden rounded-full bg-muted">
        <div className="h-full w-1/3 animate-[loading-bar-sweep_1.1s_ease-in-out_infinite] rounded-full bg-brand" />
      </div>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
