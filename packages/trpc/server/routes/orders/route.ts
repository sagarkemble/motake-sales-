import { orderService } from "../../services";
import { router, salesmanProcedure, protectedProcedure } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { forbidden, notFound } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import {
  dueDateInputSchema,
  listOrdersInputSchema,
  orderDetailSchema,
  orderIdInputSchema,
  orderSchema,
  orderWithItemsSchema,
  paginatedOrdersSchema,
  placeBookNowOrderInputSchema,
  placePreOrderInputSchema,
} from "./model";

const path = generatePath("/orders");

export const ordersRouter = router({
  placeBookNowOrder: salesmanProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/book-now"),
        tags: ["Orders"],
        protect: true,
        summary: "Place a Book Now order",
        description: "Create a same-day order for a customer. The quantity is taken from the salesman gatepass.",
      },
    })
    .input(placeBookNowOrderInputSchema)
    .output(apiResponseSchema(orderWithItemsSchema))
    .mutation(async ({ ctx, input }) => {
      const orderWithItems = await orderService.placeBookNowOrder({
        ...input,
        salesmanId: ctx.user.id,
      });
      return apiResponse(orderWithItems);
    }),

  placePreOrder: salesmanProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/pre-order"),
        tags: ["Orders"],
        protect: true,
        summary: "Place a pre-order",
        description: "Create an order for next-day delivery. The gatepass quantity does not change.",
      },
    })
    .input(placePreOrderInputSchema)
    .output(apiResponseSchema(orderWithItemsSchema))
    .mutation(async ({ ctx, input }) => {
      const orderWithItems = await orderService.placePreOrder({ ...input, salesmanId: ctx.user.id });
      return apiResponse(orderWithItems);
    }),

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
        path: path("/:id"),
        tags: ["Orders"],
        protect: true,
        summary: "Get an order",
        description: "Return one order with its line items. A salesman can view only their own order.",
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
        path: path("/:id/detail"),
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

  listDuePreorders: salesmanProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/due-preorders"),
        tags: ["Orders"],
        protect: true,
        summary: "List pre-orders due for delivery",
        description: "Return every pre-order due on the given business date.",
      },
    })
    .input(dueDateInputSchema)
    .output(apiResponseSchema(orderSchema.array()))
    .query(async ({ input }) => {
      const dueOrders = await orderService.listDuePreorders(input.businessDate);
      return apiResponse(dueOrders);
    }),

  fulfill: salesmanProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/:id/fulfill"),
        tags: ["Orders"],
        protect: true,
        summary: "Fulfill an order",
        description: "Mark an order as delivered to the customer.",
      },
    })
    .input(orderIdInputSchema)
    .output(apiResponseSchema(orderSchema))
    .mutation(async ({ ctx, input }) => {
      const orderWithItems = await orderService.getOrderWithItems(input.id);
      if (!orderWithItems) throw notFound(`Order ${input.id} not found`);
      if (orderWithItems.order.type === "book_now" && orderWithItems.order.salesmanId !== ctx.user.id) {
        throw forbidden("Only the creator can fulfill their own Book Now order");
      }
      const fulfilledOrder = await orderService.fulfillOrder(input.id, ctx.user.id);
      return apiResponse(fulfilledOrder);
    }),

  cancel: salesmanProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/:id/cancel"),
        tags: ["Orders"],
        protect: true,
        summary: "Cancel an order",
        description: "Cancel an order before it is fulfilled. Only the salesman who placed it can cancel it.",
      },
    })
    .input(orderIdInputSchema)
    .output(apiResponseSchema(orderSchema))
    .mutation(async ({ ctx, input }) => {
      const orderWithItems = await orderService.getOrderWithItems(input.id);
      if (!orderWithItems) throw notFound(`Order ${input.id} not found`);
      if (orderWithItems.order.salesmanId !== ctx.user.id) {
        throw forbidden("You can only cancel your own order");
      }
      const cancelledOrder = await orderService.cancelOrder(input.id, ctx.user.id);
      return apiResponse(cancelledOrder);
    }),
});
