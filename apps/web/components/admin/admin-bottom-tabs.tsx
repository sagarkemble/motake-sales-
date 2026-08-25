"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "~/lib/utils";
import { adminNavItems, isNavItemActive } from "./nav-items";

export function AdminBottomTabs() {
  const currentPathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_12px_rgba(0,0,0,0.04)] backdrop-blur-md md:hidden">
      <div className="grid grid-cols-5">
        {adminNavItems.map((navItem) => {
          const NavIcon = navItem.icon;
          const isActiveTab = isNavItemActive(navItem.href, currentPathname);
          return (
            <Link
              key={navItem.href}
              href={navItem.href}
              className={cn(
                "relative flex flex-col items-center gap-1 py-2 text-xs transition-colors",
                isActiveTab ? "text-brand" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "absolute top-0 h-0.5 w-8 origin-center rounded-full bg-brand transition-all duration-[var(--duration-base)] ease-[var(--ease-standard)]",
                  isActiveTab ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                )}
              />
              <NavIcon
                className={cn(
                  "size-5 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
                  isActiveTab && "scale-110",
                )}
              />
              {navItem.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
