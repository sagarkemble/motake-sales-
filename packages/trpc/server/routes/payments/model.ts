import { AMOUNT_TOO_LARGE, MAX_AMOUNT_PAISE } from "@repo/services/limits";

import { z } from "../../schema";

// Field Payment: money with no purchase. No reason field. The overpay choice is needed only when
// cash is more than the Customer's Pending; bank and UPI extra is always kept as Advance.
export const recordFieldPaymentInputSchema = z.object({
  customerId: z.string().uuid(),
  mode: z.enum(["cash", "bank", "upi"]),
  receivedPaise: z.number().int().min(0).max(MAX_AMOUNT_PAISE, AMOUNT_TOO_LARGE),
  reference: z.string().trim().max(128).optional(),
  overpay: z.enum(["return_change", "keep_advance"]).optional(),
  idempotencyKey: z.string().trim().min(1).max(120),
});

export const fieldPaymentResultSchema = z.object({
  paymentId: z.string(),
  number: z.string(),
  keptPaise: z.number().int(),
  returnedPaise: z.number().int(),
  balancePaise: z.number().int(),
});
