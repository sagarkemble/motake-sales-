import { randomUUID } from "node:crypto";

import {
  cancelBookNowOrderWithGatepassRestoration,
  countOrdersPlacedInRange,
  createBookNowOrderWithGatepassDeduction,
  createOrderWithItems,
  getOrderByIdempotencyKey,
  getOrderCountsPerSalesmanInRange,
  getOrderDetailById,
  getOrderWithItemsById,
  listDuePreordersForDate,
  listOrders,
  markOrderFulfilled,
  transitionScheduledPreordersToDue,
  type OrderCountBySalesman,
  type OrderDetail,
  type OrderListRow,
  type OrderWithItems,
} from "@repo/database/queries/orders";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import { toIstBusinessDate } from "@repo/database/queries/shared/business-date";
import type { SelectOrder } from "@repo/database/schema";

import { badRequest, conflict, notFound } from "../errors";
import {
  listOrdersInputSchema,
  placeBookNowOrderInputSchema,
  placePreOrderInputSchema,
  type ListOrdersInput,
  type OrderLineItemInput,
  type PlaceBookNowOrderInput,
  type PlacePreOrderInput,
} from "./model";

function generateOrderCode(prefix: string): string {
  const randomSuffix = randomUUID().split("-")[0]!.toUpperCase();
  return `${prefix}-${randomSuffix}`;
}

function mapGatepassDeductionError(caughtError: unknown) {
  const message = caughtError instanceof Error ? caughtError.message : "Failed to place order";
  if (message.includes("No active gatepass")) return badRequest(message);
  if (message.includes("not allotted or insufficient")) return conflict(message);
  return caughtError;
}

function mapOrderCancellationError(caughtError: unknown) {
  const message = caughtError instanceof Error ? caughtError.message : "Failed to cancel order";
  if (message.includes("not found")) return notFound(message);
  if (message.includes("already fulfilled or cancelled")) return conflict(message);
  if (message.includes("no gatepass found")) return conflict(message);
  if (message.includes("sold quantity would go negative")) return conflict(message);
  return caughtError;
}

class OrderService {
  public async placeBookNowOrder(input: PlaceBookNowOrderInput): Promise<OrderWithItems> {
    const parsedInput = placeBookNowOrderInputSchema.parse(input);

    if (parsedInput.idempotencyKey) {
      const existingOrder = await getOrderByIdempotencyKey(parsedInput.idempotencyKey);
      if (existingOrder) {
        const existingOrderWithItems = await getOrderWithItemsById(existingOrder.id);
        if (existingOrderWithItems) return existingOrderWithItems;
      }
    }

    try {
      return await createBookNowOrderWithGatepassDeduction({
        orderCode: generateOrderCode("BN"),
        salesmanId: parsedInput.salesmanId,
        customerId: parsedInput.customerId,
        businessDate: parsedInput.businessDate,
        idempotencyKey: parsedInput.idempotencyKey,
        notes: parsedInput.notes,
        items: parsedInput.items,
      });
    } catch (gatepassDeductionError) {
      throw mapGatepassDeductionError(gatepassDeductionError);
    }
  }

  public async placePreOrder(input: PlacePreOrderInput): Promise<OrderWithItems> {
    const parsedInput = placePreOrderInputSchema.parse(input);

    if (parsedInput.idempotencyKey) {
      const existingOrder = await getOrderByIdempotencyKey(parsedInput.idempotencyKey);
      if (existingOrder) {
        const existingOrderWithItems = await getOrderWithItemsById(existingOrder.id);
        if (existingOrderWithItems) return existingOrderWithItems;
      }
    }

    const totalQuantity = parsedInput.items.reduce((runningTotal, item) => runningTotal + item.quantity, 0);
    return createOrderWithItems(
      {
        orderCode: generateOrderCode("PO"),
        type: "pre_order",
        status: "scheduled",
        salesmanId: parsedInput.salesmanId,
        customerId: parsedInput.customerId,
        totalQuantity,
        scheduledDate: parsedInput.scheduledDate,
        placedAt: new Date(),
        idempotencyKey: parsedInput.idempotencyKey,
        notes: parsedInput.notes,
      },
      parsedInput.items,
    );
  }

  public async getOrderWithItems(orderId: string): Promise<OrderWithItems | undefined> {
    return getOrderWithItemsById(orderId);
  }

  public async getOrderDetail(orderId: string): Promise<OrderDetail> {
    const orderDetail = await getOrderDetailById(orderId);
    if (!orderDetail) {
      throw notFound(`Order ${orderId} not found`);
    }
    return orderDetail;
  }

  public async listOrders(input: ListOrdersInput): Promise<PaginatedResult<OrderListRow>> {
    const parsedInput = listOrdersInputSchema.parse(input);
    return listOrders(parsedInput, parsedInput);
  }

  public async listDuePreorders(businessDate: string): Promise<SelectOrder[]> {
    await transitionScheduledPreordersToDue(businessDate);
    return listDuePreordersForDate(businessDate);
  }

  public async fulfillOrder(orderId: string, fulfilledBy: string): Promise<SelectOrder> {
    const orderWithItems = await getOrderWithItemsById(orderId);
    if (!orderWithItems) {
      throw notFound(`Order ${orderId} not found`);
    }

    if (orderWithItems.order.type === "pre_order") {
      const todayBusinessDate = toIstBusinessDate(new Date());
      if (orderWithItems.order.scheduledDate > todayBusinessDate) {
        throw badRequest(
          `Pre-order is scheduled for ${orderWithItems.order.scheduledDate} and cannot be fulfilled before that date`,
        );
      }
    }

    const fulfilledOrder = await markOrderFulfilled(orderId, fulfilledBy, new Date());
    if (!fulfilledOrder) {
      throw notFound(`Order ${orderId} not found, not yours, or already fulfilled`);
    }
    return fulfilledOrder;
  }

  public async cancelOrder(orderId: string, cancelledBy: string): Promise<SelectOrder> {
    try {
      return await cancelBookNowOrderWithGatepassRestoration(orderId, cancelledBy);
    } catch (cancellationError) {
      throw mapOrderCancellationError(cancellationError);
    }
  }

  public async countOrdersPlacedInRange(
    filters: { salesmanId?: string; type?: SelectOrder["type"] },
    range: { from: Date; to: Date },
  ): Promise<number> {
    return countOrdersPlacedInRange(filters, range);
  }

  public async getOrderCountsPerSalesman(range: { from: Date; to: Date }): Promise<OrderCountBySalesman[]> {
    return getOrderCountsPerSalesmanInRange(range);
  }
}

export default OrderService;
export type { OrderLineItemInput };
