import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

interface BackHeaderProps {
  href: string;
  title: string;
  actions?: React.ReactNode;
}

export function BackHeader({ href, title, actions }: BackHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link
          href={href}
          aria-label="Go back"
          className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground hover:bg-accent"
        >
          <ChevronLeftIcon className="size-5" />
        </Link>
        <h1 className="text-base font-semibold">{title}</h1>
      </div>
      {actions}
    </div>
  );
}
