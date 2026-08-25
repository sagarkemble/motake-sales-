import { gatepassService } from "../../services";
import { z, zodUndefinedModel } from "../../schema";
import { adminProcedure, protectedProcedure, router, salesmanProcedure } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { notFound } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import {
  allotGatepassInputSchema,
  allotmentMatrixRowSchema,
  canonicalDateSchema,
  closeGatepassInputSchema,
  gatepassDateInputSchema,
  gatepassEndOfDayTotalsSchema,
  gatepassHistoryRowSchema,
  gatepassItemSchema,
  gatepassSchema,
  gatepassWithItemsSchema,
  gatepassWithItemsAndNamesSchema,
  recordReturnInputSchema,
  recordSaleInputSchema,
  submitHandoverInputSchema,
} from "./model";

const path = generatePath("/gatepasses");

export const gatepassRouter = router({
  getCanonicalDate: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/canonical-date"),
        tags: ["GatePass"],
        protect: true,
        summary: "Get canonical server business date",
        description: "Return the canonical server business date in yyyy-MM-dd format.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(canonicalDateSchema))
    .query(() => {
      const businessDate = gatepassService.getCurrentBusinessDate();
      return apiResponse({ businessDate });
    }),

  allot: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/allot"),
        tags: ["GatePass"],
        protect: true,
        summary: "Allot a daily gatepass",
        description: "Give a salesman a set quantity of each product for the day. Admin only.",
      },
    })
    .input(allotGatepassInputSchema)
    .output(apiResponseSchema(gatepassWithItemsSchema))
    .mutation(async ({ ctx, input }) => {
      const gatepassWithItems = await gatepassService.allotGatepass({
        ...input,
        issuedBy: ctx.user.id,
      });
      return apiResponse(gatepassWithItems);
    }),

  listForDate: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/"),
        tags: ["GatePass"],
        protect: true,
        summary: "List gatepasses for a date",
        description: "Return every salesman gatepass allotted for the given business date.",
      },
    })
    .input(gatepassDateInputSchema)
    .output(apiResponseSchema(z.array(gatepassSchema)))
    .query(async ({ input }) => {
      const gatepasses = await gatepassService.listGatepassesForDate(input.businessDate);
      return apiResponse(gatepasses);
    }),

  getMine: salesmanProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/me"),
        tags: ["GatePass"],
        protect: true,
        summary: "Get my gatepass",
        description: "Return the signed-in salesman gatepass and its items for the given date.",
      },
    })
    .input(gatepassDateInputSchema)
    .output(apiResponseSchema(gatepassWithItemsAndNamesSchema))
    .query(async ({ ctx, input }) => {
      const gatepassWithItems = await gatepassService.getGatepassForSalesmanAndDate(
        ctx.user.id,
        input.businessDate,
      );
      if (!gatepassWithItems) throw notFound("No gatepass for today");
      return apiResponse(gatepassWithItems);
    }),

  getMyHistory: salesmanProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/me/history"),
        tags: ["GatePass"],
        protect: true,
        summary: "Get my gatepass history",
        description: "Return every past gatepass allotted to the signed-in salesman, newest first.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(z.array(gatepassHistoryRowSchema)))
    .query(async ({ ctx }) => {
      const history = await gatepassService.getGatepassHistoryForSalesman(ctx.user.id);
      return apiResponse(history);
    }),

  getAllotmentMatrix: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/allotment-matrix"),
        tags: ["GatePass"],
        protect: true,
        summary: "Get the allotment matrix",
        description: "Return quantity allotted per salesman per product for the given date.",
      },
    })
    .input(gatepassDateInputSchema)
    .output(apiResponseSchema(z.array(allotmentMatrixRowSchema)))
    .query(async ({ input }) => {
      const matrix = await gatepassService.getAllotmentMatrix(input.businessDate);
      return apiResponse(matrix);
    }),

  getEndOfDayTotals: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/end-of-day-totals"),
        tags: ["GatePass"],
        protect: true,
        summary: "Get end-of-day totals",
        description: "Return issued, sold, and returned totals for the given business date.",
      },
    })
    .input(gatepassDateInputSchema)
    .output(apiResponseSchema(gatepassEndOfDayTotalsSchema))
    .query(async ({ input }) => {
      const totals = await gatepassService.getEndOfDayTotals(input.businessDate);
      return apiResponse(totals);
    }),

  recordReturn: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/items/return"),
        tags: ["GatePass"],
        protect: true,
        summary: "Record a gatepass return",
        description: "Record the quantity of a product a salesman returned unsold.",
      },
    })
    .input(recordReturnInputSchema)
    .output(apiResponseSchema(gatepassItemSchema))
    .mutation(async ({ input }) => {
      const item = await gatepassService.recordReturn(input);
      return apiResponse(item);
    }),

  recordSale: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/items/sale"),
        tags: ["GatePass"],
        protect: true,
        summary: "Record a gatepass sale",
        description: "Record the quantity of a product a salesman sold against the gatepass.",
      },
    })
    .input(recordSaleInputSchema)
    .output(apiResponseSchema(gatepassItemSchema))
    .mutation(async ({ input }) => {
      const item = await gatepassService.recordSale(input);
      return apiResponse(item);
    }),

  submitHandover: salesmanProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/{gatepassId}/handover"),
        tags: ["GatePass"],
        protect: true,
        summary: "Submit end-of-day handover",
        description:
          "Return all remaining stock for the signed-in salesman's own gatepass, then move it to pending verification.",
      },
    })
    .input(submitHandoverInputSchema)
    .output(apiResponseSchema(gatepassWithItemsSchema))
    .mutation(async ({ ctx, input }) => {
      const gatepassWithItems = await gatepassService.submitHandover({
        gatepassId: input.gatepassId,
        salesmanId: ctx.user.id,
      });
      return apiResponse(gatepassWithItems);
    }),

  verify: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/{id}/verify"),
        tags: ["GatePass"],
        protect: true,
        summary: "Close a gatepass",
        description: "Verify the sold and returned counts, then close the gatepass for the day.",
      },
    })
    .input(closeGatepassInputSchema)
    .output(apiResponseSchema(gatepassSchema))
    .mutation(async ({ ctx, input }) => {
      const closedGatepass = await gatepassService.closeGatepass(input.id, {
        closedBy: ctx.user.id,
        notes: input.notes,
      });
      if (!closedGatepass) throw notFound(`Gatepass ${input.id} not found`);
      return apiResponse(closedGatepass);
    }),
});
