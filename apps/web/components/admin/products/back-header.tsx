"use client";

import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface BackHeaderProps {
  href: string;
  title: string;
  avatar?: React.ReactNode;
  // Beside the title; a long title is cut short so the badge stays whole.
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}

export function BackHeader({ href, title, avatar, badge, actions }: BackHeaderProps) {
  const tx = useTranslate();

  return (
    <div className={cn("flex items-center justify-between gap-3", badge && "min-w-0")}>
      <div className={cn("flex items-center gap-3", badge && "min-w-0")}>
        <Link
          href={href}
          aria-label={tx("common.actions.goBack")}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground hover:bg-accent"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
        {avatar}
        {badge ? (
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-base font-semibold">{title}</h1>
            {badge}
          </div>
        ) : (
          <h1 className="text-base font-semibold">{title}</h1>
        )}
      </div>
      {actions}
    </div>
  );
}
