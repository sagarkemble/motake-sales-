"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface QuickActionLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
  className?: string;
}

export function QuickActionLink({ href, label, icon: Icon, className }: QuickActionLinkProps) {
  const tx = useTranslate();

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-3 overflow-hidden rounded-2xl border bg-card p-3.5 shadow-sm transition-colors hover:border-brand/30 hover:bg-accent",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-4 -top-4 size-16 rounded-full bg-brand/5 blur-xl transition-colors group-hover:bg-brand/10" />
      <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand ring-1 ring-brand/10 transition-colors group-hover:bg-brand/15">
        <Icon className="size-5" />
      </div>
      <p className="relative text-sm font-medium">{tx(label)}</p>
    </Link>
  );
}
