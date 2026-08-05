"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "~/lib/utils";
import { adminNavItems, isNavItemActive } from "./nav-items";

export function AdminBottomTabs() {
  const currentPathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <div className="grid grid-cols-5">
        {adminNavItems.map((navItem) => {
          const NavIcon = navItem.icon;
          const isActiveTab = isNavItemActive(navItem.href, currentPathname);
          return (
            <Link
              key={navItem.href}
              href={navItem.href}
              className={cn(
                "flex flex-col items-center gap-1 py-2 text-xs transition-colors",
                isActiveTab ? "text-brand" : "text-muted-foreground",
              )}
            >
              <NavIcon className="size-5" />
              {navItem.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
