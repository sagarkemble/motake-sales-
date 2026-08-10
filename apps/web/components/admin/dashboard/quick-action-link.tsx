import Link from "next/link";
import type { LucideIcon } from "lucide-react";

interface QuickActionLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function QuickActionLink({ href, label, icon: Icon }: QuickActionLinkProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border bg-card p-3.5 transition-colors hover:border-brand/40 hover:bg-brand/5"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-medium">{label}</p>
    </Link>
  );
}
