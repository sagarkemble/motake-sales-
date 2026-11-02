"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

interface EmptyStateAction {
  label: string;
  icon?: LucideIcon;
  href?: string;
  onClick?: () => void;
}

interface EmptyStateCardProps {
  title: string;
  body?: string;
  // The shape of a real row's picture: a round avatar, a square photo, or none.
  media?: "round" | "square" | "none";
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  compact?: boolean;
  className?: string;
}

/**
 * What a list shows with nothing in it: a card shaped like one of its rows, faded, then a plain
 * line saying why it is empty and what to do next.
 */
export function EmptyStateCard({
  title,
  body,
  media = "round",
  action,
  secondaryAction,
  compact = false,
  className,
}: EmptyStateCardProps) {
  return (
    <div
      className={cn(
        "col-span-full flex flex-col gap-3 rounded-2xl border bg-card shadow-sm",
        compact ? "p-3" : "p-4",
        className,
      )}
    >
      <div aria-hidden className="flex items-center gap-3 opacity-70">
        {media !== "none" && (
          <div
            className={cn(
              "shrink-0 bg-muted",
              compact ? "size-9" : "size-11",
              media === "round" ? "rounded-full" : "rounded-xl",
            )}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="h-3 w-2/5 rounded-full bg-muted" />
          <div className="h-2.5 w-3/5 rounded-full bg-muted-soft" />
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{title}</p>
        {body && <p className="text-xs text-muted-foreground">{body}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center gap-2">
          {action && <EmptyStateButton action={action} primary />}
          {secondaryAction && <EmptyStateButton action={secondaryAction} />}
        </div>
      )}
    </div>
  );
}

function EmptyStateButton({
  action,
  primary = false,
}: {
  action: EmptyStateAction;
  primary?: boolean;
}) {
  const Icon = action.icon;
  const content = (
    <>
      {Icon && <Icon className="size-4" />}
      {action.label}
    </>
  );
  const className = primary
    ? "rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
    : "rounded-full";

  return action.href ? (
    <Button asChild size="sm" variant={primary ? "default" : "outline"} className={className}>
      <Link href={action.href}>{content}</Link>
    </Button>
  ) : (
    <Button
      type="button"
      size="sm"
      variant={primary ? "default" : "outline"}
      className={className}
      onClick={action.onClick}
    >
      {content}
    </Button>
  );
}
