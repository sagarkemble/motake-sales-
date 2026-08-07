"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "~/lib/utils";
import { useCart } from "~/providers/cart-provider";
import { isNavItemActive, salesmanNavItems } from "./nav-items";

export function SalesmanBottomTabs() {
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
                "relative flex flex-col items-center gap-1 py-2 text-xs transition-colors",
                isActiveTab ? "text-brand" : "text-muted-foreground",
              )}
            >
              {isActiveTab && (
                <span className="absolute top-0 h-0.5 w-8 rounded-full bg-brand" />
              )}
              <span className="relative">
                <NavIcon className="size-5" />
                {isCartTab && totalCartQuantity > 0 && (
                  <span className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-semibold text-brand-foreground ring-2 ring-background">
                    {totalCartQuantity > 9 ? "9+" : totalCartQuantity}
                  </span>
                )}
              </span>
              {navItem.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
