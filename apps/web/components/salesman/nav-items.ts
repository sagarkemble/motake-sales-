import {
  ClipboardList,
  LayoutGrid,
  PackagePlusIcon,
  ShoppingCart,
  TicketCheck,
  TicketIcon,
  UserIcon,
} from "lucide-react";

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

export const salesmanQuickActions: SalesmanNavItem[] = [
  { label: "New Order", href: "/salesman", icon: PackagePlusIcon },
  { label: "Gate Pass", href: "/salesman/gatepass", icon: TicketIcon },
  { label: "My Orders", href: "/salesman/orders", icon: ClipboardList },
  { label: "My Account", href: "/salesman/account", icon: UserIcon },
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
