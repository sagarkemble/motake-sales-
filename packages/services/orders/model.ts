import { z } from "zod";

export const orderLineItemInputSchema = z.object({
  varietyId: z.string().uuid(),
  quantity: z.number().int().min(1),
});
export type OrderLineItemInput = z.infer<typeof orderLineItemInputSchema>;

export const placeBookNowOrderInputSchema = z.object({
  salesmanId: z.string().uuid(),
  customerId: z.string().uuid(),
  businessDate: z.string(),
  idempotencyKey: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderLineItemInputSchema).min(1),
});
export type PlaceBookNowOrderInput = z.infer<typeof placeBookNowOrderInputSchema>;

export const placePreOrderInputSchema = z.object({
  salesmanId: z.string().uuid(),
  customerId: z.string().uuid(),
  scheduledDate: z.string(),
  idempotencyKey: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderLineItemInputSchema).min(1),
});
export type PlacePreOrderInput = z.infer<typeof placePreOrderInputSchema>;

export const listOrdersInputSchema = z.object({
  salesmanId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  type: z.enum(["book_now", "pre_order"]).optional(),
  status: z.enum(["confirmed", "scheduled", "due", "fulfilled", "cancelled"]).optional(),
  customerPhone: z.string().optional(),
  placedFrom: z.date().optional(),
  placedTo: z.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
export type ListOrdersInput = z.infer<typeof listOrdersInputSchema>;
