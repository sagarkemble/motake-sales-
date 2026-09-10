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
  { label: "salesman.nav.products", href: "/salesman", icon: LayoutGrid },
  { label: "salesman.nav.cart", href: "/salesman/cart", icon: ShoppingCart },
  { label: "salesman.nav.gatepass", href: "/salesman/gatepass", icon: TicketCheck },
  { label: "salesman.nav.orders", href: "/salesman/orders", icon: ClipboardList },
];

export const salesmanQuickActions: SalesmanNavItem[] = [
  { label: "salesman.nav.quickNewOrder", href: "/salesman", icon: PackagePlusIcon },
  { label: "salesman.nav.gatepass", href: "/salesman/gatepass", icon: TicketIcon },
  { label: "salesman.nav.quickMyOrders", href: "/salesman/orders", icon: ClipboardList },
  { label: "salesman.nav.quickMyAccount", href: "/salesman/account", icon: UserIcon },
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
