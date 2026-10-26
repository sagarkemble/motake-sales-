import { paymentService } from "../../services";
import { router, salesmanProcedure } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import { fieldPaymentResultSchema, recordFieldPaymentInputSchema } from "./model";

const path = generatePath("/payments");

export const paymentsRouter = router({
  recordField: salesmanProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/field"),
        tags: ["Payments"],
        protect: true,
        summary: "Record a field Payment",
        description:
          "Take money with no purchase from a Customer on the Active GatePass Route. Kept must be above ₹0; it is numbered MP and credited to the Ledger. A retry with the same idempotency key returns the first Payment and the current Balance.",
      },
    })
    .input(recordFieldPaymentInputSchema)
    .output(apiResponseSchema(fieldPaymentResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await paymentService.recordFieldPayment(ctx.user.id, input)),
    ),
});
