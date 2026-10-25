import { z } from "zod";

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const listBillsInputSchema = z.object({
  customerId: z.string().uuid().optional(),
  salesmanId: z.string().uuid().optional(),
  billDateFrom: businessDateSchema.optional(),
  billDateTo: businessDateSchema.optional(),
  numberSearch: z.string().trim().min(1).optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
export type ListBillsInput = z.input<typeof listBillsInputSchema>;
