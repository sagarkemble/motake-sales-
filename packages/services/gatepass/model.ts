import { z } from "zod";

export const gatepassItemAllotmentSchema = z.object({
  varietyId: z.string().uuid(),
  issuedQty: z.number().int().min(0),
});
export type GatepassItemAllotment = z.infer<typeof gatepassItemAllotmentSchema>;

export const allotGatepassInputSchema = z.object({
  salesmanId: z.string().uuid(),
  // Fixed once allotted.
  routeId: z.string().uuid(),
  businessDate: z.string(),
  issuedBy: z.string().uuid(),
  items: z.array(gatepassItemAllotmentSchema).min(1),
});
export type AllotGatepassInput = z.infer<typeof allotGatepassInputSchema>;

export const recordSaleInputSchema = z.object({
  gatepassItemId: z.string().uuid(),
  quantity: z.number().int().min(1),
});
export type RecordSaleInput = z.infer<typeof recordSaleInputSchema>;

export const recordReturnInputSchema = z.object({
  gatepassItemId: z.string().uuid(),
  returnedQty: z.number().int().min(0),
});
export type RecordReturnInput = z.infer<typeof recordReturnInputSchema>;

export const gatepassShortReasonSchema = z.enum(["damaged", "expired", "lost", "leaked", "other"]);
export type GatepassShortReason = z.infer<typeof gatepassShortReasonSchema>;

export const handoverItemSchema = z.object({
  gatepassItemId: z.string().uuid(),
  returnedQty: z.number().int().min(0),
  shortReason: gatepassShortReasonSchema.optional(),
  shortNote: z.string().max(500).optional(),
});
export type HandoverItem = z.infer<typeof handoverItemSchema>;

export const submitHandoverInputSchema = z.object({
  gatepassId: z.string().uuid(),
  salesmanId: z.string().uuid(),
  items: z.array(handoverItemSchema),
});
export type SubmitHandoverInput = z.infer<typeof submitHandoverInputSchema>;

export const closeGatepassInputSchema = z.object({
  closedBy: z.string().uuid(),
  notes: z.string().optional(),
});
export type CloseGatepassInput = z.infer<typeof closeGatepassInputSchema>;

export const flagGatepassInputSchema = z.object({
  closedBy: z.string().uuid(),
  reason: z.string().min(1).max(500),
  notes: z.string().max(500).optional(),
});
export type FlagGatepassInput = z.infer<typeof flagGatepassInputSchema>;
