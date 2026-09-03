import { z } from "../../schema";

export const gatepassStatusSchema = z.enum([
  "not_issued",
  "active",
  "pending_verification",
  "closed",
]);

export const gatepassShortReasonSchema = z.enum([
  "damaged",
  "expired",
  "lost",
  "leaked",
  "other",
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
  discrepancyReason: z.string().nullable(),
  handoverSubmittedAt: z.date().nullable(),
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
  shortReason: gatepassShortReasonSchema.nullable(),
  shortNote: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const gatepassWithItemsSchema = z.object({
  gatepass: gatepassSchema,
  items: z.array(gatepassItemSchema),
});

export const gatepassWithItemsAndNamesSchema = gatepassWithItemsSchema.extend({
  issuedByName: z.string().nullable(),
  closedByName: z.string().nullable(),
});

export const gatepassHistoryRowSchema = z.object({
  gatepass: gatepassSchema,
  totalIssuedQty: z.number(),
  totalSoldQty: z.number(),
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
  shortReason: gatepassShortReasonSchema.nullable(),
  shortNote: z.string().nullable(),
});

export const recordSaleInputSchema = z.object({
  gatepassItemId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

export const recordReturnInputSchema = z.object({
  gatepassItemId: z.string().uuid(),
  returnedQty: z.number().int().min(0),
});

export const handoverItemInputSchema = z.object({
  gatepassItemId: z.string().uuid(),
  returnedQty: z.number().int().min(0),
  shortReason: gatepassShortReasonSchema.optional(),
  shortNote: z.string().max(500).optional(),
});

export const submitHandoverInputSchema = z.object({
  gatepassId: z.string().uuid(),
  items: z.array(handoverItemInputSchema),
});

export const closeGatepassInputSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().optional(),
});

export const flagGatepassInputSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().min(1).max(500),
  notes: z.string().max(500).optional(),
});

export const gatepassEndOfDayTotalsSchema = z.object({
  totalIssuedQty: z.number(),
  totalSoldQty: z.number(),
  totalReturnedQty: z.number(),
  discrepancyGatepassCount: z.number(),
});

export const discrepancyGatepassRowSchema = z.object({
  gatepassId: z.string(),
  salesmanId: z.string(),
  salesmanCode: z.string(),
  salesmanName: z.string().nullable(),
  businessDate: z.string(),
  discrepancyReason: z.string().nullable(),
  handoverSubmittedAt: z.date().nullable(),
  closedAt: z.date().nullable(),
  closedByName: z.string().nullable(),
  totalIssuedQty: z.number(),
  totalSoldQty: z.number(),
  totalReturnedQty: z.number(),
  totalShortQty: z.number(),
});

export const canonicalDateSchema = z.object({
  businessDate: z.string(),
});
