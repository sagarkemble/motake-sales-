import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { Button } from "~/components/ui/button";

interface QuickActionLinkProps {
  href: string;
  label: string;
  icon: LucideIcon;
}

export function QuickActionLink({ href, label, icon: Icon }: QuickActionLinkProps) {
  return (
    <Button
      asChild
      className="w-full justify-start gap-2 rounded-xl bg-brand text-brand-foreground hover:bg-brand/90"
    >
      <Link href={href}>
        <Icon className="size-4" />
        {label}
      </Link>
    </Button>
  );
}
