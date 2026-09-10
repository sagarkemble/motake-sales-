"use client";

import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

import { useTranslate } from "~/hooks/use-translate";

interface BackHeaderProps {
  href: string;
  title: string;
  avatar?: React.ReactNode;
  actions?: React.ReactNode;
}

export function BackHeader({ href, title, avatar, actions }: BackHeaderProps) {
  const tx = useTranslate();

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link
          href={href}
          aria-label={tx("common.actions.goBack")}
          className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground hover:bg-accent"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
        {avatar}
        <h1 className="text-base font-semibold">{title}</h1>
      </div>
      {actions}
    </div>
  );
}
