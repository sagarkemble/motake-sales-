import { z } from "../../schema";

export const orderTypeSchema = z.enum(["book_now", "pre_order"]);
export const orderStatusSchema = z.enum([
  "confirmed",
  "scheduled",
  "due",
  "fulfilled",
  "cancelled",
]);

export const orderSchema = z.object({
  id: z.string(),
  type: orderTypeSchema,
  status: orderStatusSchema,
  salesmanId: z.string().nullable(),
  customerId: z.string(),
  routeId: z.string(),
  gatepassId: z.string().nullable(),
  scheduledDate: z.string().nullable(),
  placedAt: z.date(),
  fulfilledAt: z.date().nullable(),
  fulfilledBy: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  cancelledAt: z.date().nullable(),
  cancelledBy: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Frozen Variety name and unit plus the HSN printed for tax.
export const orderLineStampSchema = z.object({
  name: z.string(),
  unit: z.string(),
  hsn: z.string(),
});

export const orderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  varietyId: z.string(),
  stamp: orderLineStampSchema,
  quantity: z.number().int(),
  routePricePaise: z.number().int(),
  exempt: z.boolean(),
  gstRateBps: z.number().int(),
  createdAt: z.date(),
});

export const orderWithItemsSchema = z.object({
  order: orderSchema,
  items: z.array(orderItemSchema),
});

export const orderItemPreviewSchema = z.object({
  productName: z.string(),
  imageUrl: z.string().nullable(),
});

export const orderBillSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  totalPaise: z.number().int(),
});

export const orderListRowSchema = z.object({
  id: z.string(),
  type: orderTypeSchema,
  status: orderStatusSchema,
  customerId: z.string(),
  customerShopName: z.string(),
  customerPhone: z.string(),
  customerShopPhotoUrl: z.string().nullable(),
  salesmanId: z.string().nullable(),
  salesmanCode: z.string().nullable(),
  salesmanName: z.string().nullable(),
  routeId: z.string(),
  routeName: z.string(),
  routeCode: z.string(),
  totalQuantity: z.number().int(),
  scheduledDate: z.string().nullable(),
  placedAt: z.date(),
  fulfilledAt: z.date().nullable(),
  cancelledAt: z.date().nullable(),
  // Null until the Bill is issued (an unfulfilled Pre-order has none).
  bill: orderBillSummarySchema.nullable(),
  itemPreviews: z.array(orderItemPreviewSchema),
});

export const paginatedOrdersSchema = z.object({
  items: z.array(orderListRowSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export const orderDetailItemSchema = z.object({
  varietyId: z.string(),
  productName: z.string(),
  stamp: orderLineStampSchema,
  quantity: z.number().int(),
  routePricePaise: z.number().int(),
  exempt: z.boolean(),
  gstRateBps: z.number().int(),
  imageUrl: z.string().nullable(),
});

export const orderDetailSchema = z.object({
  order: orderSchema,
  customer: z.object({
    shopName: z.string(),
    contactName: z.string().nullable(),
    phone: z.string(),
    address: z.string(),
    shopPhotoUrl: z.string().nullable(),
  }),
  routeName: z.string(),
  routeCode: z.string(),
  salesmanCode: z.string().nullable(),
  salesmanName: z.string().nullable(),
  fulfilledBySalesmanName: z.string().nullable(),
  totalQuantity: z.number().int(),
  bill: orderBillSummarySchema.nullable(),
  items: z.array(orderDetailItemSchema),
});

export const orderIdInputSchema = z.object({ id: z.string().uuid() });

export const listOrdersInputSchema = z.object({
  salesmanId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  type: orderTypeSchema.optional(),
  status: orderStatusSchema.optional(),
  customerPhone: z.string().optional(),
  placedFrom: z.coerce.date().optional(),
  placedTo: z.coerce.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});

// --- Checkout (Spec F).

const idempotencyKeySchema = z.string().trim().min(1).max(120);

// SKU and pack count only. Other keys pass through so the server can refuse a price field by
// name (price_field_refused) instead of a generic validation error.
export const checkoutLineInputSchema = z
  .object({
    sku: z.string().trim().min(1),
    qty: z.number(),
  })
  .loose();

export const paymentModeSchema = z.enum(["cash", "bank", "upi"]);

// ₹0 received keeps the whole Bill Pending. The overpay choice is needed only when cash is more
// than what clears Pending; bank and UPI extra is always kept as Advance.
export const checkoutPaymentInputSchema = z.object({
  mode: paymentModeSchema,
  receivedPaise: z.number().int().min(0),
  reference: z.string().trim().max(128).optional(),
  overpay: z.enum(["return_change", "keep_advance"]).optional(),
});

export const placeBookNowInputSchema = z.object({
  customerId: z.string().uuid(),
  lines: z.array(checkoutLineInputSchema),
  idempotencyKey: idempotencyKeySchema,
  notes: z.string().trim().max(1000).optional(),
  payment: checkoutPaymentInputSchema,
});

export const placePreOrderInputSchema = z.object({
  customerId: z.string().uuid(),
  scheduledDate: z.iso.date(),
  lines: z.array(checkoutLineInputSchema),
  idempotencyKey: idempotencyKeySchema,
  notes: z.string().trim().max(1000).optional(),
});

export const fulfilPreOrderInputSchema = orderIdInputSchema.extend({
  idempotencyKey: idempotencyKeySchema,
  payment: checkoutPaymentInputSchema,
});

export const quoteInputSchema = z.object({
  customerId: z.string().uuid().optional(),
  lines: z.array(checkoutLineInputSchema).default([]),
  orderType: orderTypeSchema,
  orderId: z.string().uuid().optional(),
});

export const billedCheckoutResultSchema = z.object({
  orderId: z.string(),
  billId: z.string(),
  billNumber: z.string(),
  billTotalPaise: z.number().int(),
  balanceAfterBillPaise: z.number().int(),
  payment: z
    .object({
      number: z.string(),
      keptPaise: z.number().int(),
      returnedPaise: z.number().int(),
    })
    .nullable(),
  returnedPaise: z.number().int(),
  balancePaise: z.number().int(),
});

export const preOrderResultSchema = z.object({
  orderId: z.string(),
  scheduledDate: z.string(),
  indicativeTotalPaise: z.number().int(),
  balancePaise: z.number().int(),
});

export const balanceSchema = z.object({
  balancePaise: z.number().int(),
  state: z.enum(["pending", "advance", "settled"]),
  amountPaise: z.number().int(),
});

export const quoteSchema = z.object({
  lines: z.array(
    z.object({
      sku: z.string(),
      varietyId: z.string(),
      name: z.string(),
      unit: z.string(),
      qty: z.number().int(),
      routePricePaise: z.number().int(),
      hsn: z.string(),
      exempt: z.boolean(),
      gstRateBps: z.number().int(),
      taxablePaise: z.number().int(),
      cgstPaise: z.number().int(),
      sgstPaise: z.number().int(),
      igstPaise: z.number().int(),
    }),
  ),
  totals: z.object({
    taxablePaise: z.number().int(),
    cgstPaise: z.number().int(),
    sgstPaise: z.number().int(),
    igstPaise: z.number().int(),
    grossPaise: z.number().int(),
    roundOffPaise: z.number().int(),
    totalPaise: z.number().int(),
    totalQuantity: z.number().int(),
    legalType: z.enum(["tax_invoice", "bill_of_supply"]),
  }),
  badLines: z.array(
    z.object({
      sku: z.string(),
      reason: z.enum(["unknown_sku", "bad_qty", "no_route_price", "no_tax_period"]),
    }),
  ),
  shortLines: z.array(
    z.object({
      sku: z.string(),
      name: z.string(),
      needQty: z.number().int(),
      leftQty: z.number().int(),
    }),
  ),
  balance: balanceSchema.nullable(),
  requiredToClearPaise: z.number().int().nullable(),
});

export const routePreorderSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  dueState: z.enum(["upcoming", "due", "overdue"]),
  scheduledDate: z.string(),
  placedAt: z.date(),
  customerId: z.string(),
  customerShopName: z.string(),
  customerPhone: z.string(),
  customerShopPhotoUrl: z.string().nullable(),
  placedBySalesmanId: z.string().nullable(),
  placedByName: z.string().nullable(),
  totalQuantity: z.number().int(),
  lines: z.array(
    z.object({
      varietyId: z.string(),
      name: z.string(),
      unit: z.string(),
      quantity: z.number().int(),
    }),
  ),
});
