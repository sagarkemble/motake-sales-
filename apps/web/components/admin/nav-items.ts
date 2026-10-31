import {
  BookOpenIcon,
  FileCheck2Icon,
  LayoutDashboard,
  Package,
  PackagePlusIcon,
  RouteIcon,
  ShoppingCart,
  Store,
  TicketIcon,
  Users,
  UserPlusIcon,
} from "lucide-react";

import {
  getPageTitleForPathname as getSharedPageTitleForPathname,
  isNavItemActive as isSharedNavItemActive,
} from "~/components/shared/nav-items";
import type { NavItem } from "~/components/shared/nav-items";

// The phone bottom tabs fit eight at 360px; the rest stay in the header and its menu sheet.
export type AdminNavItem = NavItem & { hideInBottomTabs?: boolean };

const ADMIN_HOME_HREF = "/admin";

export const adminNavItems: AdminNavItem[] = [
  { label: "admin.nav.dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "admin.nav.products", href: "/admin/products", icon: Package },
  { label: "admin.nav.salesman", href: "/admin/salesman", icon: Users },
  {
    label: "admin.nav.gatepass",
    href: "/admin/gatepass",
    icon: TicketIcon,
    hideInBottomTabs: true,
  },
  { label: "admin.nav.orders", href: "/admin/orders", icon: ShoppingCart },
  { label: "admin.nav.customers", href: "/admin/customers", icon: Store },
  { label: "admin.nav.ledger", href: "/admin/ledger", icon: BookOpenIcon },
  { label: "admin.nav.gst", href: "/admin/gst", icon: FileCheck2Icon },
  { label: "admin.nav.routes", href: "/admin/routes", icon: RouteIcon },
];

export const adminQuickActions: AdminNavItem[] = [
  { label: "admin.nav.quickAllotGatePass", href: "/admin/gatepass", icon: TicketIcon },
  { label: "admin.nav.quickAddProduct", href: "/admin/products/new", icon: PackagePlusIcon },
  { label: "admin.nav.quickAddSalesman", href: "/admin/salesman/new", icon: UserPlusIcon },
  { label: "admin.nav.quickViewCustomers", href: "/admin/customers", icon: Store },
  { label: "admin.nav.quickViewOrders", href: "/admin/orders", icon: ShoppingCart },
];

export function isNavItemActive(itemHref: string, currentPathname: string) {
  return isSharedNavItemActive(itemHref, currentPathname, ADMIN_HOME_HREF);
}

export function getPageTitleForPathname(currentPathname: string) {
  return getSharedPageTitleForPathname(adminNavItems, currentPathname, ADMIN_HOME_HREF, "Motake");
}
