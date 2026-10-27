import { adminBillService, customerLedgerService } from "../../services";
import { z } from "../../schema";
import { adminProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import {
  addOpeningBalanceInputSchema,
  billPaperInputSchema,
  billPaperSchema,
  cancelBillInputSchema,
  cancelBillResultSchema,
  cancelPreOrderInputSchema,
  cancelPreOrderResultSchema,
  correctBillInputSchema,
  correctPreviewSchema,
  correctResultSchema,
  customerIdInputSchema,
  ledgerSummarySchema,
  listLedgerRowsInputSchema,
  openPreorderSchema,
  openingBalanceResultSchema,
  orderIdInputSchema,
  paginatedLedgerRowsSchema,
  preOrderPaperSchema,
  previewCorrectInputSchema,
  previewRaiseBillInputSchema,
  previewRaiseNoteInputSchema,
  raiseBillCatalogRowSchema,
  raiseBillInputSchema,
  raiseBillPreviewSchema,
  raiseBillResultSchema,
  raiseNoteInputSchema,
  raiseNotePreviewSchema,
  raiseNoteResultSchema,
} from "./model";

const path = generatePath("/ledger");

// Admin only. Every write takes a reason, runs in one transaction and tells WhatsApp (Spec J)
// after commit. Refusals carry a reason in error.data.refusal. A deactivated Customer allows reads
// only (customer_inactive). PDFs download through documents.downloadLink.
export const ledgerRouter = router({
  rows: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/customers/{customerId}/rows"),
        tags: ["Ledger"],
        protect: true,
        summary: "List a Customer's Ledger rows",
        description:
          "Return a page of one Customer's Ledger rows, Opening balance first, then by posting time. Filter by row type (a Note row is typed by its Note kind), Debit or Credit and an Asia/Kolkata date range. Filters hide rows only.",
      },
    })
    .input(listLedgerRowsInputSchema)
    .output(apiResponseSchema(paginatedLedgerRowsSchema))
    .query(async ({ input }) => apiResponse(await customerLedgerService.listRows(input))),

  summary: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/customers/{customerId}/summary"),
        tags: ["Ledger"],
        protect: true,
        summary: "Get a Customer's Ledger footer",
        description:
          "Return the Customer header and the footer over the whole Ledger: Opening, Current total and Closing (Pending, Advance or Settled), and whether an Opening balance exists. Never changed by filters.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(ledgerSummarySchema))
    .query(async ({ input }) =>
      apiResponse(await customerLedgerService.getSummary(input.customerId)),
    ),

  openPreorders: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/customers/{customerId}/open-preorders"),
        tags: ["Ledger"],
        protect: true,
        summary: "List a Customer's open Pre-orders",
        description:
          "Return this Customer's unfulfilled Pre-orders, earliest first, each upcoming, due or overdue. Not Ledger rows and never in the footer.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(z.array(openPreorderSchema)))
    .query(async ({ input }) =>
      apiResponse(await customerLedgerService.listOpenPreorders(input.customerId)),
    ),

  addOpeningBalance: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/opening-balance"),
        tags: ["Ledger"],
        protect: true,
        summary: "Add an Opening balance",
        description:
          "Once per Customer: Pending (Debit) or Advance (Credit) brought forward, with a reason and an optional past Opening date. Refused as opening_balance_exists the second time. No message is sent.",
      },
    })
    .input(addOpeningBalanceInputSchema)
    .output(apiResponseSchema(openingBalanceResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await customerLedgerService.addOpeningBalance(ctx.user.id, input)),
    ),

  raiseBillCatalog: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/customers/{customerId}/raise-bill-catalog"),
        tags: ["Ledger"],
        protect: true,
        summary: "List Varieties for Raise Bill",
        description:
          "Return the Varieties sellable to this Customer today: a Route price on its Route and a tax period covering today.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(z.array(raiseBillCatalogRowSchema)))
    .query(async ({ input }) =>
      apiResponse(await adminBillService.listRaiseBillCatalog(input.customerId)),
    ),

  previewRaiseBill: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/bills/preview"),
        tags: ["Ledger"],
        protect: true,
        summary: "Preview Raise Bill",
        description:
          "Price and tax an office Bill basket today: lines, totals with round-off and legal type, unsellable lines and the Customer's Balance. No writes.",
      },
    })
    .input(previewRaiseBillInputSchema)
    .output(apiResponseSchema(raiseBillPreviewSchema))
    .query(async ({ input }) => apiResponse(await adminBillService.previewRaiseBill(input))),

  raiseBill: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/bills"),
        tags: ["Ledger"],
        protect: true,
        summary: "Raise Bill",
        description:
          "Issue an office Bill (MB) with no order, salesman, GatePass or stock: version 1 (Raised) and the Ledger debit with the Admin's reason. One bad line refuses the whole Bill. A retry with the same idempotencyKey returns the first Bill; the key with another basket is refused idempotency_key_reused.",
      },
    })
    .input(raiseBillInputSchema)
    .output(apiResponseSchema(raiseBillResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await adminBillService.raiseBill(ctx.user.id, input)),
    ),

  billPaper: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/bills/{billId}"),
        tags: ["Ledger"],
        protect: true,
        summary: "Get the Bill paper",
        description:
          "Return a Bill at its latest version (or the given one, read-only): letterhead, lines with credited and remaining qty, GST summary, Bill history, Notes, lock state, actions and the Customer's Balance.",
      },
    })
    .input(billPaperInputSchema)
    .output(apiResponseSchema(billPaperSchema))
    .query(async ({ input }) => apiResponse(await adminBillService.getBillPaper(input))),

  previewCorrect: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/bills/{billId}/correct/preview"),
        tags: ["Ledger"],
        protect: true,
        summary: "Preview Correct",
        description:
          "Return what Correct would do (history only, Debit Note, Credit Note or both), the Notes, the new totals and whether the Bill already has Notes. Refuses as Correct would. No writes.",
      },
    })
    .input(previewCorrectInputSchema)
    .output(apiResponseSchema(correctPreviewSchema))
    .query(async ({ input }) => apiResponse(await adminBillService.previewCorrect(input))),

  correct: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/bills/{billId}/correct"),
        tags: ["Ledger"],
        protect: true,
        summary: "Correct a Bill",
        description:
          "Fix line qty (0 removes) and the buyer text on the latest version at the frozen price and tax: rewrites the Bill, appends a version and writes the Credit and Debit Notes the change needs. Refused on a stale version, a cancelled or locked Bill, or below a credited qty.",
      },
    })
    .input(correctBillInputSchema)
    .output(apiResponseSchema(correctResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await adminBillService.correctBill(ctx.user.id, input)),
    ),

  cancel: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/bills/{billId}/cancel"),
        tags: ["Ledger"],
        protect: true,
        summary: "Cancel a Bill",
        description:
          "Void a Bill with one Credit Note for what is left uncredited (GST before the deadline, Commercial after), so it nets to zero. Payments stay. A Book Now's stock goes back to its GatePass only while that GatePass is active.",
      },
    })
    .input(cancelBillInputSchema)
    .output(apiResponseSchema(cancelBillResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await adminBillService.cancelBill(ctx.user.id, input)),
    ),

  previewRaiseNote: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/bills/{billId}/notes/preview"),
        tags: ["Ledger"],
        protect: true,
        summary: "Preview Raise Note",
        description:
          "Return the Note Raise Note would write and whether the Bill already has Notes. No writes.",
      },
    })
    .input(previewRaiseNoteInputSchema)
    .output(apiResponseSchema(raiseNotePreviewSchema))
    .query(async ({ input }) => apiResponse(await adminBillService.previewRaiseNote(input))),

  raiseNote: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/bills/{billId}/notes"),
        tags: ["Ledger"],
        protect: true,
        summary: "Raise a Note",
        description:
          "Write an independent GST Credit Note, Commercial Credit Note or Debit Note on chosen lines of the latest version. Never rewrites the Bill; allowed in a filed month. A GST Credit Note after the deadline is refused. A retry with the same idempotencyKey returns the first Note; the key with another Bill, kind or qty is refused idempotency_key_reused.",
      },
    })
    .input(raiseNoteInputSchema)
    .output(apiResponseSchema(raiseNoteResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await adminBillService.raiseNote(ctx.user.id, input)),
    ),

  preOrderPaper: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/pre-orders/{orderId}"),
        tags: ["Ledger"],
        protect: true,
        summary: "Get the Pre-order paper",
        description:
          "Return a Pre-order with its place-time Route stamp, scheduled date, status, locked lines, who placed it and its actions.",
      },
    })
    .input(orderIdInputSchema)
    .output(apiResponseSchema(preOrderPaperSchema))
    .query(async ({ input }) =>
      apiResponse(await adminBillService.getPreOrderPaper(input.orderId)),
    ),

  cancelPreOrder: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/pre-orders/{orderId}/cancel"),
        tags: ["Ledger"],
        protect: true,
        summary: "Cancel a Pre-order",
        description:
          "Cancel an unfulfilled Pre-order with a new order version. No Bill, Note, Ledger row or stock change.",
      },
    })
    .input(cancelPreOrderInputSchema)
    .output(apiResponseSchema(cancelPreOrderResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await adminBillService.cancelPreOrder(ctx.user.id, input)),
    ),
});
