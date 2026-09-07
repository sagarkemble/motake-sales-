"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useCart } from "~/providers/cart-provider";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";
import { isNavItemActive, salesmanNavItems } from "./nav-items";

export function SalesmanBottomTabs() {
  const tx = useTranslate();
  const currentPathname = usePathname();
  const { totalCartQuantity } = useCart();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_12px_rgba(0,0,0,0.04)] backdrop-blur-md">
      <div className="grid grid-cols-4">
        {salesmanNavItems.map((navItem) => {
          const NavIcon = navItem.icon;
          const isActiveTab = isNavItemActive(navItem.href, currentPathname);
          const isCartTab = navItem.href === "/salesman/cart";
          return (
            <Link
              key={navItem.href}
              href={navItem.href}
              className={cn(
                "relative flex min-w-0 flex-col items-center gap-0.5 px-0.5 py-2 text-muted-foreground transition-colors",
                isActiveTab && "text-brand",
              )}
            >
              <span
                className={cn(
                  "absolute top-0 h-0.5 w-8 origin-center rounded-full bg-brand transition-all duration-[var(--duration-base)] ease-[var(--ease-standard)]",
                  isActiveTab ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
                )}
              />
              <span className="relative">
                <NavIcon
                  className={cn(
                    "size-5 shrink-0 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
                    isActiveTab && "scale-110",
                  )}
                />
                {isCartTab && totalCartQuantity > 0 && (
                  <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-brand-foreground ring-2 ring-background">
                    {totalCartQuantity > 9 ? "9+" : totalCartQuantity}
                  </span>
                )}
              </span>
              <span className="line-clamp-2 max-w-full text-center text-[10px] leading-tight">
                {tx(navItem.label)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
