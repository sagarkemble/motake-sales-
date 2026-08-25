import { z } from "zod";

export const gatepassItemAllotmentSchema = z.object({
  varietyId: z.string().uuid(),
  issuedQty: z.number().int().min(0),
});
export type GatepassItemAllotment = z.infer<typeof gatepassItemAllotmentSchema>;

export const allotGatepassInputSchema = z.object({
  salesmanId: z.string().uuid(),
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

export const submitHandoverInputSchema = z.object({
  gatepassId: z.string().uuid(),
  salesmanId: z.string().uuid(),
});
export type SubmitHandoverInput = z.infer<typeof submitHandoverInputSchema>;

export const closeGatepassInputSchema = z.object({
  closedBy: z.string().uuid(),
  notes: z.string().optional(),
});
export type CloseGatepassInput = z.infer<typeof closeGatepassInputSchema>;
