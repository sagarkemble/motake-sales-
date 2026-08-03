import { reportService } from "../../services";
import { z } from "../../schema";
import { adminProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { generatePath } from "../../utils/path-generator";
import {
  dailyKpiInputSchema,
  dailyKpiSummarySchema,
  dateRangeInputSchema,
  monthlyOrderVolumeSchema,
  productSalesSummaryRowSchema,
} from "./model";

const path = generatePath("/reports");

export const reportsRouter = router({
  daily: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/daily"),
        tags: ["Reports"],
        protect: true,
        summary: "Get the daily KPI summary",
        description: "Return order and gatepass totals for one business date.",
      },
    })
    .input(dailyKpiInputSchema)
    .output(apiResponseSchema(dailyKpiSummarySchema))
    .query(async ({ input }) => {
      const summary = await reportService.getDailyKpiSummary(input);
      return apiResponse(summary);
    }),

  monthly: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/monthly"),
        tags: ["Reports"],
        protect: true,
        summary: "Get the monthly order volume",
        description: "Return the order count and quantity for each day in the given date range.",
      },
    })
    .input(dateRangeInputSchema)
    .output(apiResponseSchema(monthlyOrderVolumeSchema))
    .query(async ({ input }) => {
      const volume = await reportService.getMonthlyOrderVolume(input);
      return apiResponse(volume);
    }),

  productWiseSales: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/product-sales"),
        tags: ["Reports"],
        protect: true,
        summary: "Get product-wise sales",
        description: "Return the quantity sold per product in the given date range.",
      },
    })
    .input(dateRangeInputSchema)
    .output(apiResponseSchema(z.array(productSalesSummaryRowSchema)))
    .query(async ({ input }) => {
      const summary = await reportService.getProductWiseSalesSummary(input);
      return apiResponse(summary);
    }),

  averageFulfillmentDuration: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/average-fulfillment-duration"),
        tags: ["Reports"],
        protect: true,
        summary: "Get the average fulfillment duration",
        description: "Return the average time, in seconds, from placing an order to fulfilling it.",
      },
    })
    .input(dateRangeInputSchema)
    .output(apiResponseSchema(z.object({ averageSeconds: z.number().nullable() })))
    .query(async ({ input }) => {
      const averageSeconds = await reportService.getAverageFulfillmentDurationSeconds(input);
      return apiResponse({ averageSeconds });
    }),
});
