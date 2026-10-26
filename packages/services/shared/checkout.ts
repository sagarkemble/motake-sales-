import type { SelectCustomer } from "@repo/database/schema";

import { checkoutRefusal, notFound } from "../errors";

// Shared checkout gates for Book Now, Pre-order, fulfil and field Payment.

export const noActiveGatepassRefusal = () =>
  checkoutRefusal(
    "no_active_gatepass",
    "No Active GatePass. A closed or handed-over GatePass cannot bill.",
  );

// The Customer must exist, be active, and sit on the Route the sale is on. Checked once early
// (unlocked) and again under the Customer lock.
export function assertCustomerOnRoute(
  customer: SelectCustomer | undefined,
  customerId: string,
  routeId: string,
): asserts customer is SelectCustomer {
  if (!customer) throw notFound(`Customer ${customerId} not found`);
  if (customer.status !== "active" || customer.deletedAt) {
    throw checkoutRefusal("customer_inactive", `${customer.shopName} is inactive`, {
      customerId: customer.id,
    });
  }
  if (customer.routeId !== routeId) {
    throw checkoutRefusal(
      "customer_not_on_route",
      `${customer.shopName} is not on this Route`,
      { customerId: customer.id, customerRouteId: customer.routeId, routeId },
    );
  }
}

export const sellerMasterMissingRefusal = () =>
  checkoutRefusal(
    "seller_master_missing",
    "Seller master not set up. Admin must fill it in Settings before any Bill.",
  );

// Ledger amounts must be above ₹0, so a basket that rounds to ₹0 can never be billed.
export const billTotalZeroRefusal = () =>
  checkoutRefusal("bill_total_zero", "This basket totals ₹0 and cannot be billed.");
