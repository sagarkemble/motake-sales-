import { routeService } from "../../services";
import { z } from "../../schema";
import { adminProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import {
  clearRoutePriceInputSchema,
  clearRoutePriceOutputSchema,
  createRouteInputSchema,
  listRoutesInputSchema,
  routeChoiceSchema,
  routeChoicesInputSchema,
  routeIdInputSchema,
  routeListRowSchema,
  routePriceSchema,
  routeSchema,
  routeWithPriceFormSchema,
  setRoutePriceInputSchema,
  setRouteStatusInputSchema,
  updateRouteInputSchema,
} from "./model";

const path = generatePath("/routes");

// Admin only. Salesmen never pick a Route or change a Route price.
export const routesRouter = router({
  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/"),
        tags: ["Routes"],
        protect: true,
        summary: "List Routes",
        description:
          "Return Routes with how many varieties have a Route price. Search by name, Route code or delivery state. Hidden Routes only with includeHidden.",
      },
    })
    .input(listRoutesInputSchema)
    .output(apiResponseSchema(z.array(routeListRowSchema)))
    .query(async ({ input }) => apiResponse(await routeService.listRoutes(input))),

  choices: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/choices"),
        tags: ["Routes"],
        protect: true,
        summary: "List Route choices",
        description:
          "Return listed (not hidden) Routes, Active and Inactive, for the Customer and GatePass Route pickers.",
      },
    })
    .input(routeChoicesInputSchema)
    .output(apiResponseSchema(z.array(routeChoiceSchema)))
    .query(async ({ input }) => apiResponse(await routeService.listRouteChoices(input))),

  get: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/{id}"),
        tags: ["Routes"],
        protect: true,
        summary: "Get a Route with its price form",
        description:
          "Return the Route and every variety that is active or priced on it, with the Route price in paise or null.",
      },
    })
    .input(routeIdInputSchema)
    .output(apiResponseSchema(routeWithPriceFormSchema))
    .query(async ({ input }) => apiResponse(await routeService.getRoute(input.id))),

  create: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/"),
        tags: ["Routes"],
        protect: true,
        summary: "Create a Route",
        description:
          "Create a Route with a name and delivery state. The server generates the Route code. The Route starts with no Route prices.",
      },
    })
    .input(createRouteInputSchema)
    .output(apiResponseSchema(routeSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await routeService.createRoute(input, ctx.user.id)),
    ),

  update: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/{id}"),
        tags: ["Routes"],
        protect: true,
        summary: "Rename a Route or change its delivery state",
        description: "The Route code never changes.",
      },
    })
    .input(updateRouteInputSchema)
    .output(apiResponseSchema(routeSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      return apiResponse(await routeService.updateRoute(id, changes, ctx.user.id));
    }),

  setStatus: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/{id}/status"),
        tags: ["Routes"],
        protect: true,
        summary: "Mark a Route Active or Inactive",
        description: "Always allowed. Inactive is a label only; Hide is separate.",
      },
    })
    .input(setRouteStatusInputSchema)
    .output(apiResponseSchema(routeSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await routeService.setRouteStatus(input.id, input.status, ctx.user.id)),
    ),

  hide: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/{id}/hide"),
        tags: ["Routes"],
        protect: true,
        summary: "Hide a Route",
        description:
          "Take the Route out of lists and GatePass allotment. Refused while it has an Active GatePass or an open Pre-order.",
      },
    })
    .input(routeIdInputSchema)
    .output(apiResponseSchema(routeSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await routeService.hideRoute(input.id, ctx.user.id)),
    ),

  show: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/{id}/show"),
        tags: ["Routes"],
        protect: true,
        summary: "Show a hidden Route again",
        description: "Bring a hidden Route back to lists and GatePass allotment.",
      },
    })
    .input(routeIdInputSchema)
    .output(apiResponseSchema(routeSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await routeService.showRoute(input.id, ctx.user.id)),
    ),

  setPrice: adminProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: path("/{routeId}/prices/{varietyId}"),
        tags: ["Routes"],
        protect: true,
        summary: "Set a Route price",
        description:
          "Set or overwrite the tax-exclusive price in paise for one variety on the Route. Makes it Sellable there.",
      },
    })
    .input(setRoutePriceInputSchema)
    .output(apiResponseSchema(routePriceSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await routeService.setRoutePrice(input, ctx.user.id)),
    ),

  clearPrice: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/{routeId}/prices/{varietyId}"),
        tags: ["Routes"],
        protect: true,
        summary: "Clear a Route price",
        description: "Remove the variety's price on the Route, making it Unsellable there.",
      },
    })
    .input(clearRoutePriceInputSchema)
    .output(apiResponseSchema(clearRoutePriceOutputSchema))
    .mutation(async ({ ctx, input }) => {
      await routeService.clearRoutePrice(input, ctx.user.id);
      return apiResponse({ cleared: true as const });
    }),
});
