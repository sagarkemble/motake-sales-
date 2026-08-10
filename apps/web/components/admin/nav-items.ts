import {
  LayoutDashboard,
  Package,
  PackagePlusIcon,
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

export type AdminNavItem = NavItem;

const ADMIN_HOME_HREF = "/admin";

export const adminNavItems: AdminNavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Salesman", href: "/admin/salesman", icon: Users },
  { label: "Orders", href: "/admin/orders", icon: ShoppingCart },
  { label: "Customers", href: "/admin/customers", icon: Store },
];

export const adminQuickActions: AdminNavItem[] = [
  { label: "Allot Gate Passes", href: "/gatepass", icon: TicketIcon },
  { label: "Add Product", href: "/admin/products/new", icon: PackagePlusIcon },
  { label: "Add Salesman", href: "/admin/salesman/new", icon: UserPlusIcon },
  { label: "View Customers", href: "/admin/customers", icon: Store },
  { label: "View Orders", href: "/admin/orders", icon: ShoppingCart },
];

export function isNavItemActive(itemHref: string, currentPathname: string) {
  return isSharedNavItemActive(itemHref, currentPathname, ADMIN_HOME_HREF);
}

export function getPageTitleForPathname(currentPathname: string) {
  return getSharedPageTitleForPathname(adminNavItems, currentPathname, ADMIN_HOME_HREF, "Motake");
}
