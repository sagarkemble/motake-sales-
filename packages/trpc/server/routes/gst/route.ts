import { z, zodUndefinedModel } from "../../schema";
import { gstService } from "../../services";
import { adminProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import {
  billGstStateSchema,
  billIdInputSchema,
  correctGstr1FilingInputSchema,
  correctIrnInputSchema,
  draftPdfSchema,
  enterIrnInputSchema,
  gstr1FilingListRowSchema,
  gstr1FilingPreviewSchema,
  gstr1FilingSchema,
  irnPendingPageSchema,
  irnResultSchema,
  listIrnPendingInputSchema,
  portalCancellationResultSchema,
  portalJsonDraftSchema,
  previewGstr1FilingInputSchema,
  recordGstr1FilingInputSchema,
  recordPortalCancellationInputSchema,
  recordGstr1FilingResultSchema,
} from "./model";

const path = generatePath("/gst");

// Admin only; a salesman is refused by the procedure. Filed month is derived from the GSTR-1
// filing and the Bill date. Enter IRN and Correct IRN tell WhatsApp (Spec J) after commit; portal
// cancellation runs the Bill Cancel and tells it as a Cancel.
export const gstRouter = router({
  listFilings: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/filings"),
        tags: ["GST"],
        protect: true,
        summary: "List GSTR-1 filings",
        description:
          "Return the filed months, newest first, with filing date, reference, filer and notes.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(z.array(gstr1FilingListRowSchema)))
    .query(async () => apiResponse(await gstService.listGstr1Filings())),

  previewFiling: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/filings/preview"),
        tags: ["GST"],
        protect: true,
        summary: "Preview a GSTR-1 filing",
        description:
          "Before recording a month: whether it is already filed, how many Bills are dated in it and how many of them are still IRN pending. No writes.",
      },
    })
    .input(previewGstr1FilingInputSchema)
    .output(apiResponseSchema(gstr1FilingPreviewSchema))
    .query(async ({ input }) => apiResponse(await gstService.previewGstr1Filing(input))),

  recordFiling: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/filings"),
        tags: ["GST"],
        protect: true,
        summary: "Record a GSTR-1 filing",
        description:
          "Record that GSTR-1 for a month (YYYY-MM) is filed; the signed-in Admin is the filer. The month becomes a Filed month: line Correct and Cancel are refused on its Bills. One filing per month, no future month, no unfile. Returns the IRN pending count in the month as a warning.",
      },
    })
    .input(recordGstr1FilingInputSchema)
    .output(apiResponseSchema(recordGstr1FilingResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await gstService.recordGstr1Filing(ctx.user.id, input)),
    ),

  correctFiling: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/filings/{filingId}"),
        tags: ["GST"],
        protect: true,
        summary: "Correct a GSTR-1 filing",
        description:
          "Fix the filing date, reference and notes with a reason. The month and the filer never change and the month stays filed.",
      },
    })
    .input(correctGstr1FilingInputSchema)
    .output(apiResponseSchema(gstr1FilingSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await gstService.correctGstr1Filing(ctx.user.id, input)),
    ),

  irnPendingCount: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/irn-pending/count"),
        tags: ["GST"],
        protect: true,
        summary: "Count IRN pending Bills",
        description: "Return how many Bills wait for an IRN, for the nav badge.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(z.number().int()))
    .query(async () => apiResponse(await gstService.countIrnPending())),

  listIrnPending: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/irn-pending"),
        tags: ["GST"],
        protect: true,
        summary: "List IRN pending Bills",
        description:
          "Return a page of Bills waiting for an IRN, oldest Bill date first: number, Customer, Route, Bill date, total and whether the month is filed.",
      },
    })
    .input(listIrnPendingInputSchema)
    .output(apiResponseSchema(irnPendingPageSchema))
    .query(async ({ input }) => apiResponse(await gstService.listIrnPending(input))),

  billState: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/bills/{billId}/state"),
        tags: ["GST"],
        protect: true,
        summary: "Get a Bill's GST state",
        description:
          "Return the Bill's IRN status and fields, whether its month is filed, and which of line Correct, Cancel, portal cancellation, Enter IRN, Correct IRN, Raise Note and the drafts apply, with the reason for each refused one.",
      },
    })
    .input(billIdInputSchema)
    .output(apiResponseSchema(billGstStateSchema))
    .query(async ({ input }) => apiResponse(await gstService.getBillGstState(input))),

  enterIrn: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/bills/{billId}/irn"),
        tags: ["GST"],
        protect: true,
        summary: "Enter IRN",
        description:
          "Record IRN, ack number, ack date and signed QR text (plus an optional PNG or JPEG signed QR image up to 1 MB) on an IRN pending Bill. First writer wins; an identical retry returns the saved IRN. Refused when the IRN is on another Bill.",
      },
    })
    .input(enterIrnInputSchema)
    .output(apiResponseSchema(irnResultSchema))
    .mutation(async ({ ctx, input }) => apiResponse(await gstService.enterIrn(ctx.user.id, input))),

  correctIrn: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/bills/{billId}/irn"),
        tags: ["GST"],
        protect: true,
        summary: "Correct IRN",
        description:
          "Overwrite the IRN fields with a reason. Never unlocks line Correct or Cancel; allowed in a Filed month. A new Bill PDF replaces the stored one after commit.",
      },
    })
    .input(correctIrnInputSchema)
    .output(apiResponseSchema(irnResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await gstService.correctIrn(ctx.user.id, input)),
    ),

  recordPortalCancellation: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/bills/{billId}/portal-cancellation"),
        tags: ["GST"],
        protect: true,
        summary: "Record portal cancellation",
        description:
          "For an IRN Bill already cancelled on the e-invoice portal: record the cancellation ack and Cancel the Bill in the same transaction (Credit Note for what is left, Payments kept, number kept). Refused without IRN (use Cancel) or in a Filed month (Raise Note).",
      },
    })
    .input(recordPortalCancellationInputSchema)
    .output(apiResponseSchema(portalCancellationResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await gstService.recordPortalCancellation(ctx.user.id, input)),
    ),

  portalJsonDraft: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/bills/{billId}/portal-json"),
        tags: ["GST"],
        protect: true,
        summary: "Get the Portal JSON draft",
        description:
          "Build the e-invoice portal JSON from the current Bill, marked as a Motake draft (DRAFT-IRN-PENDING). Only while the Bill is IRN pending; never stored.",
      },
    })
    .input(billIdInputSchema)
    .output(apiResponseSchema(portalJsonDraftSchema))
    .query(async ({ input }) => apiResponse(await gstService.buildPortalJsonDraft(input))),

  draftPdf: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/bills/{billId}/draft-pdf"),
        tags: ["GST"],
        protect: true,
        summary: "Get the Draft PDF",
        description:
          'Return the Draft PDF (base64) of the latest Bill version, marked "Draft — IRN pending". Only while the Bill is IRN pending; never stored and never sent.',
      },
    })
    .input(billIdInputSchema)
    .output(apiResponseSchema(draftPdfSchema))
    .query(async ({ input }) => apiResponse(await gstService.drawDraftPdf(input))),
});
