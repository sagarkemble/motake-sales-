import {
  BanknoteIcon,
  ClipboardList,
  LayoutGrid,
  ShoppingCart,
  TicketCheck,
  UserIcon,
  UserPlusIcon,
  UsersIcon,
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

// The menu's Quick actions: what the bottom tabs don't have. Add customer and Record Payment open
// Route Customers with the form, or the shop pick, already started (`?action=`).
export const salesmanQuickActions: (SalesmanNavItem & { hint: string })[] = [
  {
    label: "salesman.nav.quickAddCustomer",
    hint: "salesman.nav.quickAddCustomerHint",
    href: "/salesman/customers?action=add",
    icon: UserPlusIcon,
  },
  {
    label: "salesman.nav.quickRecordPayment",
    hint: "salesman.nav.quickRecordPaymentHint",
    href: "/salesman/customers?action=payment",
    icon: BanknoteIcon,
  },
  {
    label: "salesman.nav.customers",
    hint: "salesman.nav.quickCustomersHint",
    href: "/salesman/customers",
    icon: UsersIcon,
  },
  {
    label: "salesman.nav.quickMyAccount",
    hint: "salesman.nav.quickMyAccountHint",
    href: "/salesman/account",
    icon: UserIcon,
  },
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
