import { randomUUID } from "node:crypto";

import {
  cancelBookNowOrderWithGatepassRestoration,
  countOrdersPlacedInRange,
  createBookNowOrderWithGatepassDeduction,
  createOrderWithItems,
  getOrderByIdempotencyKey,
  getOrderCountsPerSalesmanInRange,
  getOrderWithItemsById,
  listDuePreordersForDate,
  listOrders,
  markOrderFulfilled,
  transitionScheduledPreordersToDue,
  type OrderCountBySalesman,
  type OrderWithItems,
} from "@repo/database/queries/orders";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { SelectOrder } from "@repo/database/schema";

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

    return createBookNowOrderWithGatepassDeduction({
      orderCode: generateOrderCode("BN"),
      salesmanId: parsedInput.salesmanId,
      customerId: parsedInput.customerId,
      businessDate: parsedInput.businessDate,
      idempotencyKey: parsedInput.idempotencyKey,
      notes: parsedInput.notes,
      items: parsedInput.items,
    });
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

  public async listOrders(input: ListOrdersInput): Promise<PaginatedResult<SelectOrder>> {
    const parsedInput = listOrdersInputSchema.parse(input);
    return listOrders(parsedInput, parsedInput);
  }

  public async listDuePreorders(businessDate: string): Promise<SelectOrder[]> {
    return listDuePreordersForDate(businessDate);
  }

  public async transitionScheduledPreordersToDue(businessDate: string): Promise<SelectOrder[]> {
    return transitionScheduledPreordersToDue(businessDate);
  }

  public async fulfillOrder(orderId: string, fulfilledBy: string): Promise<SelectOrder> {
    const fulfilledOrder = await markOrderFulfilled(orderId, fulfilledBy, new Date());
    if (!fulfilledOrder) {
      throw new Error(`Order ${orderId} not found or already fulfilled`);
    }
    return fulfilledOrder;
  }

  public async cancelOrder(orderId: string, cancelledBy: string): Promise<SelectOrder> {
    return cancelBookNowOrderWithGatepassRestoration(orderId, cancelledBy);
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
