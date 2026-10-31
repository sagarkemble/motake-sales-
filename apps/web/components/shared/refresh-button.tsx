"use client";

import { RefreshCwIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface RefreshButtonProps {
  /** Refetches the page's queries; may return their promises. */
  onRefresh: () => unknown;
  /** True while any of those queries is fetching: the icon spins and the button waits. */
  isRefreshing: boolean;
  className?: string;
}

/** Reloads data that may have gone stale while the page stayed open. */
export function RefreshButton({ onRefresh, isRefreshing, className }: RefreshButtonProps) {
  const tx = useTranslate();

  return (
    <Button
      type="button"
      size="icon"
      variant="outline"
      aria-label={tx("common.actions.reload")}
      title={tx("common.actions.reload")}
      disabled={isRefreshing}
      onClick={() => void onRefresh()}
      className={cn("size-9 shrink-0 rounded-full", className)}
    >
      <RefreshCwIcon className={cn("size-4", isRefreshing && "animate-spin")} />
    </Button>
  );
}
