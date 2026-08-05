import { authService, salesmanService } from "../../services";
import { z, zodUndefinedModel } from "../../schema";
import { adminProcedure, router, salesmanProcedure } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { notFound } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import {
  createSalesmanAccountInputSchema,
  listSalesmenInputSchema,
  paginatedSalesmenSchema,
  profileSchema,
  salesmanDayWiseHistoryRowSchema,
  salesmanHistoryInputSchema,
  salesmanIdInputSchema,
  salesmanSchema,
  salesmanWithProfileSchema,
  updateSalesmanAccountInputSchema,
} from "./model";

const path = generatePath("/salesmen");

export const salesmanRouter = router({
  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/"),
        tags: ["Salesmen"],
        protect: true,
        summary: "List salesmen",
        description: "Return a page of salesman accounts. Admin only.",
      },
    })
    .input(listSalesmenInputSchema)
    .output(apiResponseSchema(paginatedSalesmenSchema))
    .query(async ({ input }) => {
      const result = await salesmanService.listSalesmen(input);
      return apiResponse(result);
    }),

  getById: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/:id"),
        tags: ["Salesmen"],
        protect: true,
        summary: "Get a salesman by ID",
        description: "Return a salesman account and profile by ID. Admin only.",
      },
    })
    .input(salesmanIdInputSchema)
    .output(apiResponseSchema(salesmanWithProfileSchema))
    .query(async ({ input }) => {
      const salesmanWithProfile = await salesmanService.getSalesmanWithProfile(input.id);
      if (!salesmanWithProfile) throw notFound("Salesman profile not found");
      return apiResponse(salesmanWithProfile);
    }),

  create: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/"),
        tags: ["Salesmen"],
        protect: true,
        summary: "Add a salesman",
        description: "Create a salesman account and profile. Admin only.",
      },
    })
    .input(createSalesmanAccountInputSchema)
    .output(apiResponseSchema(salesmanSchema))
    .mutation(async ({ input }) => {
      const { salesman } = await authService.createSalesmanAccount(input);
      return apiResponse(salesman);
    }),

  deactivate: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/:id"),
        tags: ["Salesmen"],
        protect: true,
        summary: "Deactivate a salesman",
        description: "Mark the salesman profile as inactive. Admin only.",
      },
    })
    .input(salesmanIdInputSchema)
    .output(apiResponseSchema(z.object({ deactivated: z.literal(true) })))
    .mutation(async ({ input }) => {
      await authService.deactivateSalesmanAccount(input.id);
      return apiResponse({ deactivated: true as const });
    }),

  reactivate: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/:id/reactivate"),
        tags: ["Salesmen"],
        protect: true,
        summary: "Reactivate a salesman",
        description: "Mark the salesman profile as active. Admin only.",
      },
    })
    .input(salesmanIdInputSchema)
    .output(apiResponseSchema(z.object({ reactivated: z.literal(true) })))
    .mutation(async ({ input }) => {
      await authService.reactivateSalesmanAccount(input.id);
      return apiResponse({ reactivated: true as const });
    }),

  delete: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/:id/delete"),
        tags: ["Salesmen"],
        protect: true,
        summary: "Delete a salesman",
        description: "Ban the salesman login and soft-delete the profile. Admin only.",
      },
    })
    .input(salesmanIdInputSchema)
    .output(apiResponseSchema(z.object({ deleted: z.literal(true) })))
    .mutation(async ({ input }) => {
      await authService.deleteSalesmanAccount(input.id);
      return apiResponse({ deleted: true as const });
    }),

  update: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/:id"),
        tags: ["Salesmen"],
        protect: true,
        summary: "Update a salesman account",
        description: "Change the name, phone, email, or password of a salesman. Admin only.",
      },
    })
    .input(salesmanIdInputSchema.extend(updateSalesmanAccountInputSchema.shape))
    .output(apiResponseSchema(profileSchema))
    .mutation(async ({ input }) => {
      const { id, ...changes } = input;
      const profile = await authService.updateSalesmanAccount(id, changes);
      return apiResponse(profile);
    }),

  getHistory: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/:id/history"),
        tags: ["Salesmen"],
        protect: true,
        summary: "Get a salesman day-wise history",
        description: "Return one row per day for the salesman order activity in the given date range.",
      },
    })
    .input(salesmanHistoryInputSchema)
    .output(apiResponseSchema(z.array(salesmanDayWiseHistoryRowSchema)))
    .query(async ({ input }) => {
      const history = await salesmanService.getDayWiseHistory(input.id, {
        from: input.from,
        to: input.to,
      });
      return apiResponse(history);
    }),

  getMyProfile: salesmanProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/me"),
        tags: ["Salesmen"],
        protect: true,
        summary: "Get my salesman profile",
        description: "Return the profile of the signed-in salesman.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(salesmanWithProfileSchema))
    .query(async ({ ctx }) => {
      const salesmanWithProfile = await salesmanService.getSalesmanWithProfile(ctx.user.id);
      if (!salesmanWithProfile) throw notFound("Salesman profile not found");
      return apiResponse(salesmanWithProfile);
    }),
});
