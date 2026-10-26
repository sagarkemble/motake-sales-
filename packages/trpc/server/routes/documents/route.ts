import { documentService } from "../../services";
import { adminProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import {
  downloadLinkInputSchema,
  downloadLinkSchema,
  signedQrImageLinkInputSchema,
  signedQrImageLinkSchema,
} from "./model";

const path = generatePath("/documents");

export const documentsRouter = router({
  downloadLink: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/download-link"),
        tags: ["Documents"],
        protect: true,
        summary: "Get a Document download link",
        description:
          "Return a 5-minute download link to the PDF of a Bill version or a Note, drawing it first when it was never drawn. Refused while a Tax Invoice waits for its IRN (use the Draft PDF). Admin only.",
      },
    })
    .input(downloadLinkInputSchema)
    .output(apiResponseSchema(downloadLinkSchema))
    .query(async ({ ctx, input }) => {
      const target = input.billVersionId
        ? { billVersionId: input.billVersionId }
        : { noteId: input.noteId! };
      const link = await documentService.getDownloadLink(ctx.user.id, target);
      return apiResponse(link);
    }),

  signedQrImageLink: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/signed-qr-image/{billId}"),
        tags: ["Documents"],
        protect: true,
        summary: "Get the signed QR image link",
        description:
          "Return a 5-minute link that shows the Bill's uploaded signed QR image. Admin only.",
      },
    })
    .input(signedQrImageLinkInputSchema)
    .output(apiResponseSchema(signedQrImageLinkSchema))
    .query(async ({ ctx, input }) => {
      const link = await documentService.getSignedQrImageLink(ctx.user.id, input.billId);
      return apiResponse(link);
    }),
});
