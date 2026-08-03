import { z } from "zod";

export const dailyKpiInputSchema = z.object({
  businessDate: z.string(),
  placedFrom: z.date(),
  placedTo: z.date(),
});
export type DailyKpiInput = z.infer<typeof dailyKpiInputSchema>;

export const dateRangeInputSchema = z.object({
  from: z.date(),
  to: z.date(),
});
export type DateRangeInput = z.infer<typeof dateRangeInputSchema>;
