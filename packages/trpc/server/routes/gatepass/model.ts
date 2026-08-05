import { z } from "../../schema";

export const gatepassStatusSchema = z.enum([
  "not_issued",
  "active",
  "pending_verification",
  "closed",
]);

export const gatepassSchema = z.object({
  id: z.string(),
  salesmanId: z.string(),
  businessDate: z.string(),
  status: gatepassStatusSchema,
  issuedBy: z.string(),
  closedBy: z.string().nullable(),
  closedAt: z.date().nullable(),
  hasDiscrepancy: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const gatepassItemSchema = z.object({
  id: z.string(),
  gatepassId: z.string(),
  varietyId: z.string(),
  issuedQty: z.number(),
  soldQty: z.number(),
  returnedQty: z.number(),
  availableQty: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const gatepassWithItemsSchema = z.object({
  gatepass: gatepassSchema,
  items: z.array(gatepassItemSchema),
});

export const allotGatepassInputSchema = z.object({
  salesmanId: z.string().uuid(),
  businessDate: z.string(),
  items: z
    .array(z.object({ varietyId: z.string().uuid(), issuedQty: z.number().int().min(0) }))
    .min(1),
});

export const gatepassDateInputSchema = z.object({ businessDate: z.string() });

export const allotmentMatrixRowSchema = z.object({
  salesmanId: z.string(),
  salesmanCode: z.string(),
  varietyId: z.string(),
  productName: z.string(),
  varietyName: z.string(),
  issuedQty: z.number(),
  soldQty: z.number(),
  availableQty: z.number().nullable(),
  returnedQty: z.number(),
});

export const recordSaleInputSchema = z.object({
  gatepassItemId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

export const recordReturnInputSchema = z.object({
  gatepassItemId: z.string().uuid(),
  returnedQty: z.number().int().min(0),
});

export const closeGatepassInputSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().optional(),
});

export const gatepassEndOfDayTotalsSchema = z.object({
  totalIssuedQty: z.number(),
  totalSoldQty: z.number(),
  totalReturnedQty: z.number(),
  discrepancyGatepassCount: z.number(),
});

export const canonicalDateSchema = z.object({
  businessDate: z.string(),
});
