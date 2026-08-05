import { LayoutGrid, ShoppingCart, TicketCheck, ClipboardList } from "lucide-react";

import {
  getPageTitleForPathname as getSharedPageTitleForPathname,
  isNavItemActive as isSharedNavItemActive,
} from "~/components/shared/nav-items";
import type { NavItem } from "~/components/shared/nav-items";

export type SalesmanNavItem = NavItem;

const SALESMAN_HOME_HREF = "/salesman";

export const salesmanNavItems: SalesmanNavItem[] = [
  { label: "Products", href: "/salesman", icon: LayoutGrid },
  { label: "Cart", href: "/salesman/cart", icon: ShoppingCart },
  { label: "Gate Pass", href: "/salesman/gatepass", icon: TicketCheck },
  { label: "Orders", href: "/salesman/orders", icon: ClipboardList },
];

export function isNavItemActive(itemHref: string, currentPathname: string) {
  return isSharedNavItemActive(itemHref, currentPathname, SALESMAN_HOME_HREF);
}

export function getPageTitleForPathname(currentPathname: string) {
  return getSharedPageTitleForPathname(
    salesmanNavItems,
    currentPathname,
    SALESMAN_HOME_HREF,
    "Motake",
  );
}
