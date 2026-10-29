import { settingsService, whatsAppTokenService } from "../../services";
import { adminProcedure, router } from "../../trpc";
import { z, zodUndefinedModel } from "../../schema";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import {
  creditNoteDeadlineEntrySchema,
  financialYearInputSchema,
  sendWaitingResultSchema,
  numberSeriesEntrySchema,
  prepareYearInputSchema,
  sellerSettingsSchema,
  sellerSetupDefaultsSchema,
  seriesIdInputSchema,
  setCreditNoteDeadlineInputSchema,
  settingsHistoryEntrySchema,
  setUpSellerSettingsInputSchema,
  updatePrefixInputSchema,
  updateSellerSettingsInputSchema,
  updateWhatsAppTokenInputSchema,
  whatsAppTokenSettingsSchema,
} from "./model";

const path = generatePath("/settings");

const sellerRouter = router({
  get: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/seller"),
        tags: ["Settings"],
        protect: true,
        summary: "Get the Seller master",
        description:
          "Return Motake's seller details, or null while the Seller master is not set up.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(sellerSettingsSchema.nullable()))
    .query(async () => {
      const settings = await settingsService.getSellerSettings();
      return apiResponse(settings);
    }),

  setupDefaults: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/seller/setup-defaults"),
        tags: ["Settings"],
        protect: true,
        summary: "Get the Seller master setup values",
        description:
          "Return the CA-confirmed seller details that prefill the one-time setup form. Writes nothing.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(sellerSetupDefaultsSchema))
    .query(() => apiResponse(settingsService.getSellerSetupDefaults())),

  setUp: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/seller"),
        tags: ["Settings"],
        protect: true,
        summary: "Set up the Seller master",
        description:
          "Create the single Seller master row. Refused once it exists. E-invoicing stays on. Admin only.",
      },
    })
    .input(setUpSellerSettingsInputSchema)
    .output(apiResponseSchema(sellerSettingsSchema))
    .mutation(async ({ ctx, input }) => {
      const settings = await settingsService.setUpSellerSettings(input, ctx.user.id);
      return apiResponse(settings);
    }),

  update: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/seller"),
        tags: ["Settings"],
        protect: true,
        summary: "Update the Seller master",
        description:
          "Change seller details. Applies to Bills and Notes issued after the save; the PAN, bank details, terms and place apply to Documents drawn after it. Saving no change records nothing.",
      },
    })
    .input(updateSellerSettingsInputSchema)
    .output(apiResponseSchema(sellerSettingsSchema))
    .mutation(async ({ ctx, input }) => {
      const settings = await settingsService.updateSellerSettings(input, ctx.user.id);
      return apiResponse(settings);
    }),

  history: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/seller/history"),
        tags: ["Settings"],
        protect: true,
        summary: "List Seller master changes",
        description:
          "Return who changed the Seller master, when, and the old and new values, newest first.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(z.array(settingsHistoryEntrySchema)))
    .query(async () => {
      const history = await settingsService.listSellerSettingsHistory();
      return apiResponse(history);
    }),
});

const numberSeriesRouter = router({
  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/number-series"),
        tags: ["Settings"],
        protect: true,
        summary: "List a year's number series",
        description:
          "Return the five Document prefixes of a financial year with the next number each will issue and whether it can still be changed.",
      },
    })
    .input(financialYearInputSchema)
    .output(apiResponseSchema(z.array(numberSeriesEntrySchema)))
    .query(async ({ input }) => {
      const series = await settingsService.listNumberSeries(input.financialYear);
      return apiResponse(series);
    }),

  updatePrefix: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/number-series/prefix"),
        tags: ["Settings"],
        protect: true,
        summary: "Change a Document prefix",
        description:
          "Change one series prefix for the current or next financial year, until that series issues its first number.",
      },
    })
    .input(updatePrefixInputSchema)
    .output(apiResponseSchema(z.array(numberSeriesEntrySchema)))
    .mutation(async ({ ctx, input }) => {
      const series = await settingsService.updatePrefix(input, ctx.user.id);
      return apiResponse(series);
    }),

  prepareYear: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/number-series/prepare-year"),
        tags: ["Settings"],
        protect: true,
        summary: "Prepare next year's number series",
        description:
          "Create next financial year's missing series with the default prefixes. Existing series are left alone.",
      },
    })
    .input(prepareYearInputSchema)
    .output(apiResponseSchema(z.array(numberSeriesEntrySchema)))
    .mutation(async ({ ctx, input }) => {
      const series = await settingsService.prepareFinancialYear(input, ctx.user.id);
      return apiResponse(series);
    }),

  history: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/number-series/{seriesId}/history"),
        tags: ["Settings"],
        protect: true,
        summary: "List a number series' changes",
        description: "Return who created the series and who changed its prefix, newest first.",
      },
    })
    .input(seriesIdInputSchema)
    .output(apiResponseSchema(z.array(settingsHistoryEntrySchema)))
    .query(async ({ input }) => {
      const history = await settingsService.listNumberSeriesHistory(input.seriesId);
      return apiResponse(history);
    }),
});

const creditNoteDeadlineRouter = router({
  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/credit-note-deadlines"),
        tags: ["Settings"],
        protect: true,
        summary: "List GST Credit Note deadlines",
        description:
          "Return each financial year in use up to next year with its deadline and whether it is the default or set by Admin.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(z.array(creditNoteDeadlineEntrySchema)))
    .query(async () => {
      const deadlines = await settingsService.listCreditNoteDeadlines();
      return apiResponse(deadlines);
    }),

  set: adminProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: path("/credit-note-deadlines"),
        tags: ["Settings"],
        protect: true,
        summary: "Set a GST Credit Note deadline",
        description:
          "Set the deadline date (YYYY-MM-DD) for a financial year. It must be after 31 March of that year's end.",
      },
    })
    .input(setCreditNoteDeadlineInputSchema)
    .output(apiResponseSchema(creditNoteDeadlineEntrySchema))
    .mutation(async ({ ctx, input }) => {
      const deadline = await settingsService.setCreditNoteDeadline(input, ctx.user.id);
      return apiResponse(deadline);
    }),

  history: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/credit-note-deadlines/{financialYear}/history"),
        tags: ["Settings"],
        protect: true,
        summary: "List a year's deadline changes",
        description: "Return who set or changed a financial year's deadline, newest first.",
      },
    })
    .input(financialYearInputSchema)
    .output(apiResponseSchema(z.array(settingsHistoryEntrySchema)))
    .query(async ({ input }) => {
      const history = await settingsService.listCreditNoteDeadlineHistory(input.financialYear);
      return apiResponse(history);
    }),
});

// Spec J-0: the WhatsApp access token. The token goes in once and never comes back out.
const whatsappTokenRouter = router({
  status: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/whatsapp-token"),
        tags: ["Settings"],
        protect: true,
        summary: "Get the WhatsApp access token status",
        description:
          "Return whether the token works (unknown while the notification service does not answer), why WhatsApp messages are paused (token or payment, or null), how many messages are waiting and when a message last went out.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(whatsAppTokenSettingsSchema))
    .query(async () => {
      const status = await whatsAppTokenService.status();
      return apiResponse(status);
    }),

  update: adminProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: path("/whatsapp-token"),
        tags: ["Settings"],
        protect: true,
        summary: "Save a new WhatsApp access token",
        description:
          "Check the token with Meta, save it to Vault, record who saved it and have the notification service use it at once. Refused as token_invalid when Meta rejects it.",
      },
    })
    .input(updateWhatsAppTokenInputSchema)
    .output(apiResponseSchema(whatsAppTokenSettingsSchema))
    .mutation(async ({ ctx, input }) => {
      const status = await whatsAppTokenService.update(input, ctx.user.id);
      return apiResponse(status);
    }),

  sendWaiting: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/whatsapp-token/send-waiting"),
        tags: ["Settings"],
        protect: true,
        summary: "Send waiting WhatsApp messages",
        description:
          "Queue every message held on a token error or a WhatsApp account payment problem now. Refused as token_not_working while the token is refused.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(sendWaitingResultSchema))
    .mutation(async () => {
      const result = await whatsAppTokenService.sendWaiting();
      return apiResponse(result);
    }),
});

export const settingsRouter = router({
  seller: sellerRouter,
  numberSeries: numberSeriesRouter,
  creditNoteDeadline: creditNoteDeadlineRouter,
  whatsappToken: whatsappTokenRouter,
});
