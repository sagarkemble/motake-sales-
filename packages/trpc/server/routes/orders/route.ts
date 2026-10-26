import { orderService } from "../../services";
import { z, zodUndefinedModel } from "../../schema";
import {
  adminOrSalesmanProcedure,
  adminProcedure,
  router,
  salesmanProcedure,
  protectedProcedure,
} from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { forbidden, notFound } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import {
  billedCheckoutResultSchema,
  fulfilPreOrderInputSchema,
  listOrdersInputSchema,
  orderDetailSchema,
  orderIdInputSchema,
  orderSchema,
  orderWithItemsSchema,
  paginatedOrdersSchema,
  placeBookNowInputSchema,
  placePreOrderInputSchema,
  preOrderResultSchema,
  quoteInputSchema,
  quoteSchema,
  routePreorderSchema,
} from "./model";

const path = generatePath("/orders");

export const ordersRouter = router({
  placeBookNow: salesmanProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/book-now"),
        tags: ["Orders"],
        protect: true,
        summary: "Place a Book Now",
        description:
          "Sell from the Active GatePass to a Customer on its Route: the server locks Route price and tax, deducts stock, issues the Bill (MB), debits the Ledger and records the optional checkout Payment (MP). Lines are Variety SKU and qty only. A retry with the same idempotency key returns the first result. Refusals carry a reason in error.data.refusal.",
      },
    })
    .input(placeBookNowInputSchema)
    .output(apiResponseSchema(billedCheckoutResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await orderService.placeBookNow(ctx.user.id, input)),
    ),

  placePreOrder: salesmanProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/pre-order"),
        tags: ["Orders"],
        protect: true,
        summary: "Place a Pre-order",
        description:
          "Book a Customer on the Active GatePass Route for a date after today at today's Route price and tax classification. No Bill, number, Ledger row, stock change or Payment. A retry with the same idempotency key returns the first result.",
      },
    })
    .input(placePreOrderInputSchema)
    .output(apiResponseSchema(preOrderResultSchema))
    .mutation(async ({ ctx, input }) =>
      apiResponse(await orderService.placePreOrder(ctx.user.id, input)),
    ),

  fulfilPreOrder: adminOrSalesmanProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/{id}/fulfil"),
        tags: ["Orders"],
        protect: true,
        summary: "Fulfil a Pre-order",
        description:
          "Bill a Pre-order on or after its scheduled date from the terms locked at place, with the optional checkout Payment. A salesman needs an Active GatePass on the Pre-order's Route; Admin needs none. First writer wins; the same actor retrying gets the first result.",
      },
    })
    .input(fulfilPreOrderInputSchema)
    .output(apiResponseSchema(billedCheckoutResultSchema))
    .mutation(async ({ ctx, input: { id, ...fulfilInput } }) =>
      apiResponse(
        await orderService.fulfilPreOrder(
          { profileId: ctx.user.id, role: ctx.user.role },
          { orderId: id, ...fulfilInput },
        ),
      ),
    ),

  quote: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/quote"),
        tags: ["Orders"],
        protect: true,
        summary: "Quote a basket",
        description:
          "Price and tax a basket on the server: per line Route price and GST, totals with round-off and legal type, unsellable lines and (Book Now) short lines, and the Customer's Balance with what clears Pending after this Bill. With orderId, quotes that Pre-order's fulfil from its locked terms. No writes.",
      },
    })
    .input(quoteInputSchema)
    .output(apiResponseSchema(quoteSchema))
    .query(async ({ ctx, input }) =>
      apiResponse(await orderService.quote({ profileId: ctx.user.id, role: ctx.user.role }, input)),
    ),

  listRoutePreorders: salesmanProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/route-preorders"),
        tags: ["Orders"],
        protect: true,
        summary: "List open Pre-orders on my Route",
        description:
          "Return open Pre-orders on the Active GatePass Route from any salesman, earliest first, each upcoming, due or overdue (Asia/Kolkata).",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(z.array(routePreorderSchema)))
    .query(async ({ ctx }) => apiResponse(await orderService.listRoutePreorders(ctx.user.id))),

  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/"),
        tags: ["Orders"],
        protect: true,
        summary: "List orders",
        description: "Return a page of orders. A salesman sees only their own orders.",
      },
    })
    .input(listOrdersInputSchema)
    .output(apiResponseSchema(paginatedOrdersSchema))
    .query(async ({ ctx, input }) => {
      const scopedInput =
        ctx.user.role === "salesman" ? { ...input, salesmanId: ctx.user.id } : input;
      const result = await orderService.listOrders(scopedInput);
      return apiResponse(result);
    }),

  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/{id}"),
        tags: ["Orders"],
        protect: true,
        summary: "Get an order",
        description:
          "Return one order with its line items. A salesman can view only their own order.",
      },
    })
    .input(orderIdInputSchema)
    .output(apiResponseSchema(orderWithItemsSchema))
    .query(async ({ ctx, input }) => {
      const orderWithItems = await orderService.getOrderWithItems(input.id);
      if (!orderWithItems) throw notFound(`Order ${input.id} not found`);
      if (ctx.user.role === "salesman" && orderWithItems.order.salesmanId !== ctx.user.id) {
        throw forbidden();
      }
      return apiResponse(orderWithItems);
    }),

  getDetail: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/{id}/detail"),
        tags: ["Orders"],
        protect: true,
        summary: "Get full order detail",
        description:
          "Return the order with customer, salesman and product/variety names for display.",
      },
    })
    .input(orderIdInputSchema)
    .output(apiResponseSchema(orderDetailSchema))
    .query(async ({ ctx, input }) => {
      const orderDetail = await orderService.getOrderDetail(input.id);
      if (ctx.user.role === "salesman" && orderDetail.order.salesmanId !== ctx.user.id) {
        throw forbidden();
      }
      return apiResponse(orderDetail);
    }),

  cancel: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/{id}/cancel"),
        tags: ["Orders"],
        protect: true,
        summary: "Cancel an order",
        description:
          "Admin cancels an unfulfilled Pre-order. A salesman cannot cancel. A Book Now is cancelled from its Bill (Spec G) and is refused here.",
      },
    })
    .input(orderIdInputSchema)
    .output(apiResponseSchema(orderSchema))
    .mutation(async ({ ctx, input }) => {
      const cancelledOrder = await orderService.cancelOrder(input.id, ctx.user.id);
      return apiResponse(cancelledOrder);
    }),
});
