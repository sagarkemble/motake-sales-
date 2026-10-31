import { z, zodUndefinedModel } from "../../schema";
import { gstService } from "../../services";
import { adminProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import {
  billGstStateSchema,
  billIdInputSchema,
  correctGstr1FilingInputSchema,
  gstr1FilingListRowSchema,
  gstr1FilingPreviewSchema,
  gstr1FilingSchema,
  previewGstr1FilingInputSchema,
  recordGstr1FilingInputSchema,
  recordGstr1FilingResultSchema,
} from "./model";

const path = generatePath("/gst");

// Admin only; a salesman is refused by the procedure. Filed month is derived from the GSTR-1
// filing and the Bill date.
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
          "Before recording a month: whether it is already filed and how many Bills are dated in it. No writes.",
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
          "Record that GSTR-1 for a month (YYYY-MM) is filed; the signed-in Admin is the filer. The month becomes a Filed month: line Correct and Cancel are refused on its Bills. One filing per month, no future month, no unfile.",
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

  billState: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/bills/{billId}/state"),
        tags: ["GST"],
        protect: true,
        summary: "Get a Bill's GST state",
        description:
          "Return whether the Bill's month is filed and whether it is cancelled, and which of line Correct, Cancel and Raise Note apply, with the reason for each refused one.",
      },
    })
    .input(billIdInputSchema)
    .output(apiResponseSchema(billGstStateSchema))
    .query(async ({ input }) => apiResponse(await gstService.getBillGstState(input))),
});
