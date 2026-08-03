import { z } from "zod";

export const createSalesmanInputSchema = z.object({
  id: z.uuid(),
  salesmanCode: z.string().min(1).max(32),
});
export type CreateSalesmanInput = z.infer<typeof createSalesmanInputSchema>;

export const updateSalesmanCodeInputSchema = z.object({
  salesmanCode: z.string().min(1).max(32),
});
export type UpdateSalesmanCodeInput = z.infer<typeof updateSalesmanCodeInputSchema>;

export const listSalesmenInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
export type ListSalesmenInput = z.infer<typeof listSalesmenInputSchema>;

export const salesmanHistoryRangeInputSchema = z.object({
  from: z.string(),
  to: z.string(),
});
export type SalesmanHistoryRangeInput = z.infer<typeof salesmanHistoryRangeInputSchema>;
