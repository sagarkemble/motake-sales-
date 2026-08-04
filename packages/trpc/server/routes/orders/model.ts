import { z } from "../../schema";

export const orderTypeSchema = z.enum(["book_now", "pre_order"]);
export const orderStatusSchema = z.enum(["confirmed", "scheduled", "due", "fulfilled", "cancelled"]);

export const orderSchema = z.object({
  id: z.string(),
  orderCode: z.string(),
  type: orderTypeSchema,
  status: orderStatusSchema,
  salesmanId: z.string(),
  customerId: z.string(),
  totalQuantity: z.number(),
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

export const orderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  varietyId: z.string(),
  quantity: z.number(),
  createdAt: z.date(),
});

export const orderWithItemsSchema = z.object({
  order: orderSchema,
  items: z.array(orderItemSchema),
});

export const orderListRowSchema = z.object({
  order: orderSchema,
  customerShopName: z.string(),
  customerPhone: z.string(),
  salesmanCode: z.string(),
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
  varietyName: z.string(),
  unit: z.string(),
  quantity: z.number(),
});

export const orderDetailSchema = z.object({
  order: orderSchema,
  customer: z.object({
    shopName: z.string(),
    contactName: z.string().nullable(),
    phone: z.string(),
    address: z.string(),
  }),
  salesmanCode: z.string(),
  items: z.array(orderDetailItemSchema),
});

const orderLineItemSchema = z.object({
  varietyId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

export const placeBookNowOrderInputSchema = z.object({
  customerId: z.string().uuid(),
  businessDate: z.string(),
  idempotencyKey: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderLineItemSchema).min(1),
});

export const placePreOrderInputSchema = z.object({
  customerId: z.string().uuid(),
  scheduledDate: z.string(),
  idempotencyKey: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderLineItemSchema).min(1),
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

export const dueDateInputSchema = z.object({ businessDate: z.string() });
