import { z } from "../../schema";

export const dailyKpiInputSchema = z.object({
  businessDate: z.string(),
  placedFrom: z.coerce.date(),
  placedTo: z.coerce.date(),
});

export const dailyKpiSummarySchema = z.object({
  bookNowOrderCount: z.number(),
  preOrderCount: z.number(),
  fulfilledOrderCount: z.number(),
  salesValuePaise: z.number().int(),
  gatepassTotals: z.object({
    totalIssuedQty: z.number(),
    totalSoldQty: z.number(),
    totalReturnedQty: z.number(),
    discrepancyGatepassCount: z.number(),
  }),
});

export const dateRangeInputSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export const orderCountBySalesmanSchema = z.object({
  salesmanId: z.string(),
  salesmanCode: z.string(),
  orderCount: z.number(),
});

export const monthlyOrderVolumeSchema = z.object({
  totalOrderCount: z.number(),
  perSalesman: z.array(orderCountBySalesmanSchema),
});

export const productSalesSummaryRowSchema = z.object({
  varietyId: z.string(),
  productName: z.string(),
  varietyName: z.string(),
  totalQuantitySold: z.number(),
  taxablePaise: z.number().int(),
  taxPaise: z.number().int(),
});
