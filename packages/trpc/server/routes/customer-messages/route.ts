import { customerMessageService } from "../../services";
import { z } from "../../schema";
import { adminOrSalesmanProcedure, adminProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import {
  customerMessageStatusSchema,
  listForCustomerInputSchema,
  listForDocumentInputSchema,
  resendInputSchema,
  sendLatestBillInputSchema,
  sentMessageResultSchema,
} from "./model";

const path = generatePath("/customer-messages");

// Spec J: WhatsApp message status on the papers and Resend. The notification app is reached only
// through the service with the internal key; the browser never calls it.
export const customerMessagesRouter = router({
  listForDocument: adminOrSalesmanProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/document"),
        tags: ["Customer messages"],
        protect: true,
        summary: "List WhatsApp messages for a paper",
        description:
          "Return the WhatsApp messages about one Bill (every version, its account updates, cancellation and Notes), Note, Payment or Refund, newest first, with status and skip reason. A salesman needs an Active GatePass on the Customer's Route.",
      },
    })
    .input(listForDocumentInputSchema)
    .output(apiResponseSchema(z.array(customerMessageStatusSchema)))
    .query(async ({ ctx, input }) => {
      const target = input.billId
        ? { billId: input.billId }
        : input.noteId
          ? { noteId: input.noteId }
          : input.paymentId
            ? { paymentId: input.paymentId }
            : { refundId: input.refundId! };
      return apiResponse(
        await customerMessageService.listForDocument(
          { profileId: ctx.user.id, role: ctx.user.role },
          target,
        ),
      );
    }),

  listForCustomer: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/customer/{customerId}"),
        tags: ["Customer messages"],
        protect: true,
        summary: "List a Customer's WhatsApp messages",
        description:
          "Return every WhatsApp message sent about the Customer's Bills, Notes, Payments and Refunds, newest first. Admin only.",
      },
    })
    .input(listForCustomerInputSchema)
    .output(apiResponseSchema(z.array(customerMessageStatusSchema)))
    .query(async ({ input }) => apiResponse(await customerMessageService.listForCustomer(input))),

  resend: adminOrSalesmanProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/{notificationId}/resend"),
        tags: ["Customer messages"],
        protect: true,
        summary: "Resend a WhatsApp message",
        description:
          "Send the stored message again (same template, values and PDF) to the Customer's current phone. Refused while it is still being sent, for an older Bill version, or once the template wording changed. A salesman needs an Active GatePass on the Customer's Route.",
      },
    })
    .input(resendInputSchema)
    .output(apiResponseSchema(sentMessageResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(
        await customerMessageService.resend({ profileId: ctx.user.id, role: ctx.user.role }, input),
      ),
    ),

  sendLatestBill: adminOrSalesmanProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/bills/{billId}/send-latest"),
        tags: ["Customer messages"],
        protect: true,
        summary: "Send the latest Bill on WhatsApp",
        description:
          "Send the Bill's current version with its PDF, or resend the message already made for it. Refused for a cancelled or IRN pending Bill. A salesman needs an Active GatePass on the Customer's Route.",
      },
    })
    .input(sendLatestBillInputSchema)
    .output(apiResponseSchema(sentMessageResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(
        await customerMessageService.sendLatestBill(
          { profileId: ctx.user.id, role: ctx.user.role },
          input,
        ),
      ),
    ),
});
