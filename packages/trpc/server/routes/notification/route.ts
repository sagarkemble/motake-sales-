import { internalProcedure, router } from "../../notification/trpc";
import { z, zodUndefinedModel } from "../../schema";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import {
  enqueueInputSchema,
  enqueueResultSchema,
  healthSchema,
  listByBusinessRefsInputSchema,
  listTemplatesInputSchema,
  notificationIdInputSchema,
  notificationStatusViewSchema,
  notificationTemplateSchema,
  resendInputSchema,
  resendResultSchema,
  resolveTemplateInputSchema,
  resumeHeldResultSchema,
  suppressInputSchema,
  suppressResultSchema,
  whatsAppTokenStatusSchema,
} from "./model";

// Mounted only on apps/notification; never on serverRouter or the web client (ADR-0001). These
// procedure names are the contract Spec J codes against.
export const notificationRouter = router({
  // Persists before it acknowledges; the same idempotency key returns the same id.
  enqueue: internalProcedure
    .input(enqueueInputSchema)
    .output(apiResponseSchema(enqueueResultSchema))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.notificationService.enqueue(input);
      return apiResponse(result);
    }),

  getStatus: internalProcedure
    .input(notificationIdInputSchema)
    .output(apiResponseSchema(notificationStatusViewSchema))
    .query(async ({ ctx, input }) => {
      const status = await ctx.notificationService.getStatus(input.notificationId);
      return apiResponse(status);
    }),

  listByBusinessRefs: internalProcedure
    .input(listByBusinessRefsInputSchema)
    .output(apiResponseSchema(z.array(notificationStatusViewSchema)))
    .query(async ({ ctx, input }) => {
      const statuses = await ctx.notificationService.listByBusinessRefs(input);
      return apiResponse(statuses);
    }),

  // A new attempt on the saved template version, values and attachment; refused while pending.
  resend: internalProcedure
    .input(resendInputSchema)
    .output(apiResponseSchema(resendResultSchema))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.notificationService.resend(input);
      return apiResponse(result);
    }),

  // Skips a still-pending run that has not reached Meta; otherwise says it was too late.
  suppress: internalProcedure
    .input(suppressInputSchema)
    .output(apiResponseSchema(suppressResultSchema))
    .mutation(async ({ ctx, input }) => {
      const result = await ctx.notificationService.suppress(input);
      return apiResponse(result);
    }),

  health: internalProcedure
    .input(zodUndefinedModel)
    .output(apiResponseSchema(healthSchema))
    .query(async ({ ctx }) => {
      const health = await ctx.notificationService.health();
      return apiResponse(health);
    }),

  // Spec J-0: the working token's state at the last check and how many messages are held.
  tokenStatus: internalProcedure
    .input(zodUndefinedModel)
    .output(apiResponseSchema(whatsAppTokenStatusSchema))
    .query(async ({ ctx }) => {
      const status = await ctx.notificationService.tokenStatus();
      return apiResponse(status);
    }),

  // Checks the token now (refilling the secret file from Vault if needed) and returns the new
  // status; the main API calls it right after an Admin saves a token.
  refreshToken: internalProcedure
    .input(zodUndefinedModel)
    .output(apiResponseSchema(whatsAppTokenStatusSchema))
    .mutation(async ({ ctx }) => {
      const status = await ctx.notificationService.syncToken();
      return apiResponse(status);
    }),

  // Sends every held message now; refused as token_not_working while the token does not work.
  resumeHeld: internalProcedure
    .input(zodUndefinedModel)
    .output(apiResponseSchema(resumeHeldResultSchema))
    .mutation(async ({ ctx }) => {
      const result = await ctx.notificationService.resumeHeld();
      return apiResponse(result);
    }),

  // Read-only: template rows are inserted by hand.
  listTemplates: internalProcedure
    .input(listTemplatesInputSchema)
    .output(apiResponseSchema(z.array(notificationTemplateSchema)))
    .query(async ({ ctx, input }) => {
      const templates = await ctx.notificationService.listTemplates(input);
      return apiResponse(templates);
    }),

  // The version enqueue would use now; `verified` says whether enqueue would refuse it.
  resolveTemplate: internalProcedure
    .input(resolveTemplateInputSchema)
    .output(apiResponseSchema(notificationTemplateSchema))
    .query(async ({ ctx, input }) => {
      const template = await ctx.notificationService.resolveTemplate(input);
      return apiResponse(template);
    }),
});
