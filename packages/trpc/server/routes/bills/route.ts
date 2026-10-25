import { billService, orderService } from "../../services";
import { adminProcedure, protectedProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { forbidden } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import {
  billDetailSchema,
  billIdInputSchema,
  billNumberInputSchema,
  billOrderIdInputSchema,
  listBillsInputSchema,
  paginatedBillsSchema,
} from "./model";

const path = generatePath("/bills");

export const billsRouter = router({
  list: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/"),
        tags: ["Bills"],
        protect: true,
        summary: "List Bills",
        description:
          "Return a page of Bills, newest Bill date first. Filter by Customer, salesman, Bill date or number. Admin only.",
      },
    })
    .input(listBillsInputSchema)
    .output(apiResponseSchema(paginatedBillsSchema))
    .query(async ({ input }) => {
      const result = await billService.listBills(input);
      return apiResponse(result);
    }),

  // Declared before getById: the REST adapter matches paths in order, and /{id} would
  // otherwise take /by-number.
  getByNumber: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/by-number"),
        tags: ["Bills"],
        protect: true,
        summary: "Find a Bill by number",
        description:
          "Return the Bill with this exact number, for example MB/26-27/000123. Admin only.",
      },
    })
    .input(billNumberInputSchema)
    .output(apiResponseSchema(billDetailSchema))
    .query(async ({ input }) => {
      const bill = await billService.getBillByNumber(input.number);
      return apiResponse(bill);
    }),

  getById: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/{id}"),
        tags: ["Bills"],
        protect: true,
        summary: "Get a Bill",
        description:
          "Return the current Bill with its letterhead, paise totals and lines. Admin only.",
      },
    })
    .input(billIdInputSchema)
    .output(apiResponseSchema(billDetailSchema))
    .query(async ({ input }) => {
      const bill = await billService.getBill(input.id);
      return apiResponse(bill);
    }),

  getForOrder: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/for-order/{orderId}"),
        tags: ["Bills"],
        protect: true,
        summary: "Get the Bill of an order",
        description:
          "Return the order's Bill, or null when it has none yet. A salesman can view only their own order's Bill.",
      },
    })
    .input(billOrderIdInputSchema)
    .output(apiResponseSchema(billDetailSchema.nullable()))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role === "salesman") {
        const orderDetail = await orderService.getOrderDetail(input.orderId);
        if (orderDetail.order.salesmanId !== ctx.user.id) throw forbidden();
      }
      const bill = await billService.getBillForOrder(input.orderId);
      return apiResponse(bill ?? null);
    }),
});
