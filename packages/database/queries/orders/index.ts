import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  customersTable,
  gatepassItemsTable,
  gatepassesTable,
  orderItemsTable,
  ordersTable,
  productVarietiesTable,
  productsTable,
  profilesTable,
  salesmenTable,
  type InsertOrder,
  type SelectOrder,
  type SelectOrderItem,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import { toIstBusinessDate } from "../shared/business-date";
import {
  buildPaginationOffsets,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../shared/pagination";

export interface OrderWithItems {
  order: SelectOrder;
  items: SelectOrderItem[];
}

export interface OrderLineQuantityInput {
  varietyId: string;
  quantity: number;
}

interface PricedOrderLine {
  varietyId: string;
  quantity: number;
  unitPrice: number;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

async function resolvePricedOrderLines(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  lineItems: OrderLineQuantityInput[],
): Promise<{ pricedLines: PricedOrderLine[]; totalQuantity: number; totalAmount: number }> {
  const varietyIds = [...new Set(lineItems.map((lineItem) => lineItem.varietyId))];
  const varietyRows = await tx
    .select({
      id: productVarietiesTable.id,
      unitPrice: productVarietiesTable.unitPrice,
      status: productVarietiesTable.status,
      deletedAt: productVarietiesTable.deletedAt,
    })
    .from(productVarietiesTable)
    .where(inArray(productVarietiesTable.id, varietyIds));

  const varietyById = new Map(varietyRows.map((variety) => [variety.id, variety]));
  const pricedLines: PricedOrderLine[] = [];
  let totalQuantity = 0;
  let totalAmount = 0;

  for (const lineItem of lineItems) {
    const variety = varietyById.get(lineItem.varietyId);
    if (!variety || variety.deletedAt || variety.status !== "active") {
      throw new Error(`Variety ${lineItem.varietyId} is missing or inactive`);
    }
    const unitPrice = Number(variety.unitPrice);
    const lineTotal = roundMoney(unitPrice * lineItem.quantity);
    pricedLines.push({
      varietyId: lineItem.varietyId,
      quantity: lineItem.quantity,
      unitPrice,
    });
    totalQuantity += lineItem.quantity;
    totalAmount = roundMoney(totalAmount + lineTotal);
  }

  return { pricedLines, totalQuantity, totalAmount };
}

export async function createOrderWithItems(
  newOrder: Omit<InsertOrder, "totalQuantity" | "totalAmount">,
  lineItems: OrderLineQuantityInput[],
): Promise<OrderWithItems> {
  return db.transaction(async (tx) => {
    const { pricedLines, totalQuantity, totalAmount } = await resolvePricedOrderLines(tx, lineItems);
    const insertedOrderRows = await tx
      .insert(ordersTable)
      .values({ ...newOrder, totalQuantity, totalAmount })
      .returning();
    const createdOrder = firstOrThrow(insertedOrderRows, "createOrderWithItems");
    const createdItems = await tx
      .insert(orderItemsTable)
      .values(
        pricedLines.map((lineItem) => ({
          orderId: createdOrder.id,
          varietyId: lineItem.varietyId,
          quantity: lineItem.quantity,
          unitPrice: lineItem.unitPrice,
        })),
      )
      .returning();
    return { order: createdOrder, items: createdItems };
  });
}

export async function getOrderById(orderId: string): Promise<SelectOrder | undefined> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  return order;
}

export async function getOrderByCode(orderCode: string): Promise<SelectOrder | undefined> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.orderCode, orderCode));
  return order;
}

export async function getOrderByIdempotencyKey(
  idempotencyKey: string,
): Promise<SelectOrder | undefined> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.idempotencyKey, idempotencyKey));
  return order;
}

export async function listOrderItemsByOrderId(orderId: string): Promise<SelectOrderItem[]> {
  return db.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
}

export async function getOrderWithItemsById(orderId: string): Promise<OrderWithItems | undefined> {
  const order = await getOrderById(orderId);
  if (!order) return undefined;
  const items = await listOrderItemsByOrderId(orderId);
  return { order, items };
}

export interface OrderDetailItem {
  varietyId: string;
  productName: string;
  varietyName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  imageUrl: string | null;
}

export interface OrderDetail {
  order: SelectOrder;
  customer: {
    shopName: string;
    contactName: string | null;
    phone: string;
    address: string;
  };
  salesmanCode: string;
  salesmanName: string | null;
  fulfilledBySalesmanName: string | null;
  items: OrderDetailItem[];
}

export async function getOrderDetailById(orderId: string): Promise<OrderDetail | undefined> {
  const order = await getOrderById(orderId);
  if (!order) return undefined;

  const customerRows = await db
    .select({
      shopName: customersTable.shopName,
      contactName: customersTable.contactName,
      phone: customersTable.phone,
      address: customersTable.address,
    })
    .from(customersTable)
    .where(eq(customersTable.id, order.customerId));

  const salesmanRows = await db
    .select({ salesmanCode: salesmenTable.salesmanCode, salesmanName: profilesTable.name })
    .from(salesmenTable)
    .innerJoin(profilesTable, eq(salesmenTable.id, profilesTable.id))
    .where(eq(salesmenTable.id, order.salesmanId));

  const items = await db
    .select({
      varietyId: orderItemsTable.varietyId,
      productName: productsTable.name,
      varietyName: productVarietiesTable.name,
      unit: productVarietiesTable.unit,
      quantity: orderItemsTable.quantity,
      unitPrice: orderItemsTable.unitPrice,
      imageUrl: productsTable.imageUrl,
    })
    .from(orderItemsTable)
    .innerJoin(productVarietiesTable, eq(orderItemsTable.varietyId, productVarietiesTable.id))
    .innerJoin(productsTable, eq(productVarietiesTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, orderId));

  const salesmanRow = firstOrThrow(salesmanRows, `getOrderDetailById salesman for order ${orderId}`);

  let fulfilledBySalesmanName: string | null = null;
  if (order.fulfilledBy) {
    const fulfilledByRows = await db
      .select({ salesmanName: profilesTable.name })
      .from(salesmenTable)
      .innerJoin(profilesTable, eq(salesmenTable.id, profilesTable.id))
      .where(eq(salesmenTable.id, order.fulfilledBy));
    fulfilledBySalesmanName = fulfilledByRows[0]?.salesmanName ?? null;
  }

  return {
    order,
    customer: firstOrThrow(customerRows, `getOrderDetailById customer for order ${orderId}`),
    salesmanCode: salesmanRow.salesmanCode,
    salesmanName: salesmanRow.salesmanName,
    fulfilledBySalesmanName,
    items,
  };
}

export interface OrderListFilters {
  salesmanId?: string;
  customerId?: string;
  type?: SelectOrder["type"];
  status?: SelectOrder["status"];
  customerPhone?: string;
  placedFrom?: Date;
  placedTo?: Date;
}

export interface OrderItemPreview {
  productName: string;
  imageUrl: string | null;
}

export interface OrderListRow {
  order: SelectOrder;
  customerShopName: string;
  customerPhone: string;
  salesmanCode: string;
  salesmanName: string | null;
  itemPreviews: OrderItemPreview[];
}

async function attachItemPreviews(rows: Omit<OrderListRow, "itemPreviews">[]): Promise<OrderListRow[]> {
  if (rows.length === 0) return [];

  const orderIds = rows.map((row) => row.order.id);
  const itemRows = await db
    .selectDistinct({
      orderId: orderItemsTable.orderId,
      productName: productsTable.name,
      imageUrl: productsTable.imageUrl,
    })
    .from(orderItemsTable)
    .innerJoin(productVarietiesTable, eq(orderItemsTable.varietyId, productVarietiesTable.id))
    .innerJoin(productsTable, eq(productVarietiesTable.productId, productsTable.id))
    .where(inArray(orderItemsTable.orderId, orderIds));

  const itemPreviewsByOrderId = new Map<string, OrderItemPreview[]>();
  for (const itemRow of itemRows) {
    const existingItemPreviews = itemPreviewsByOrderId.get(itemRow.orderId) ?? [];
    existingItemPreviews.push({ productName: itemRow.productName, imageUrl: itemRow.imageUrl });
    itemPreviewsByOrderId.set(itemRow.orderId, existingItemPreviews);
  }

  return rows.map((row) => ({
    ...row,
    itemPreviews: (itemPreviewsByOrderId.get(row.order.id) ?? []).slice(0, 4),
  }));
}

export async function listOrders(
  filters: OrderListFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<OrderListRow>> {
  const { limit, offset } = buildPaginationOffsets(pagination);
  const whereClause = and(
    filters.salesmanId ? eq(ordersTable.salesmanId, filters.salesmanId) : undefined,
    filters.customerId ? eq(ordersTable.customerId, filters.customerId) : undefined,
    filters.type ? eq(ordersTable.type, filters.type) : undefined,
    filters.status ? eq(ordersTable.status, filters.status) : undefined,
    filters.customerPhone ? eq(customersTable.phone, filters.customerPhone) : undefined,
    filters.placedFrom ? gte(ordersTable.placedAt, filters.placedFrom) : undefined,
    filters.placedTo ? lte(ordersTable.placedAt, filters.placedTo) : undefined,
  );

  const [rows, countRows] = await Promise.all([
    db
      .select({
        order: ordersTable,
        customerShopName: customersTable.shopName,
        customerPhone: customersTable.phone,
        salesmanCode: salesmenTable.salesmanCode,
        salesmanName: profilesTable.name,
      })
      .from(ordersTable)
      .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
      .innerJoin(salesmenTable, eq(ordersTable.salesmanId, salesmenTable.id))
      .innerJoin(profilesTable, eq(salesmenTable.id, profilesTable.id))
      .where(whereClause)
      .orderBy(desc(ordersTable.placedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ totalCount: count() })
      .from(ordersTable)
      .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
      .where(whereClause),
  ]);

  const { totalCount } = firstOrThrow(countRows, "listOrders count");
  const rowsWithItemPreviews = await attachItemPreviews(rows);
  return toPaginatedResult(rowsWithItemPreviews, totalCount, pagination);
}

export async function listDuePreordersForDate(businessDate: string): Promise<SelectOrder[]> {
  return db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.type, "pre_order"),
        eq(ordersTable.scheduledDate, businessDate),
        inArray(ordersTable.status, ["scheduled", "due"]),
      ),
    )
    .orderBy(asc(ordersTable.placedAt));
}

export async function transitionScheduledPreordersToDue(
  businessDate: string,
): Promise<SelectOrder[]> {
  return db
    .update(ordersTable)
    .set({ status: "due" })
    .where(
      and(
        eq(ordersTable.type, "pre_order"),
        eq(ordersTable.status, "scheduled"),
        lte(ordersTable.scheduledDate, businessDate),
      ),
    )
    .returning();
}

export async function markOrderFulfilled(
  orderId: string,
  fulfilledBy: string,
  fulfilledAt: Date,
): Promise<SelectOrder | undefined> {
  const [fulfilledOrder] = await db
    .update(ordersTable)
    .set({ status: "fulfilled", fulfilledAt, fulfilledBy })
    .where(
      and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.salesmanId, fulfilledBy),
        sql`${ordersTable.status} NOT IN ('fulfilled', 'cancelled')`,
      ),
    )
    .returning();
  return fulfilledOrder;
}

export async function cancelOrder(
  orderId: string,
  cancelledBy: string,
  cancelledAt: Date,
): Promise<SelectOrder | undefined> {
  const [cancelledOrder] = await db
    .update(ordersTable)
    .set({ status: "cancelled", cancelledAt, cancelledBy })
    .where(
      and(eq(ordersTable.id, orderId), isNull(ordersTable.fulfilledAt), isNull(ordersTable.cancelledAt)),
    )
    .returning();
  return cancelledOrder;
}

export async function countOrdersPlacedInRange(
  filters: { salesmanId?: string; type?: SelectOrder["type"] },
  range: { from: Date; to: Date },
): Promise<number> {
  const countRows = await db
    .select({ totalCount: count() })
    .from(ordersTable)
    .where(
      and(
        filters.salesmanId ? eq(ordersTable.salesmanId, filters.salesmanId) : undefined,
        filters.type ? eq(ordersTable.type, filters.type) : undefined,
        gte(ordersTable.placedAt, range.from),
        lte(ordersTable.placedAt, range.to),
      ),
    );
  return firstOrThrow(countRows, "countOrdersPlacedInRange").totalCount;
}

export interface OrderCountBySalesman {
  salesmanId: string;
  salesmanCode: string;
  orderCount: number;
}

export async function getOrderCountsPerSalesmanInRange(
  range: { from: Date; to: Date },
): Promise<OrderCountBySalesman[]> {
  return db
    .select({
      salesmanId: ordersTable.salesmanId,
      salesmanCode: salesmenTable.salesmanCode,
      orderCount: count(),
    })
    .from(ordersTable)
    .innerJoin(salesmenTable, eq(ordersTable.salesmanId, salesmenTable.id))
    .where(and(gte(ordersTable.placedAt, range.from), lte(ordersTable.placedAt, range.to)))
    .groupBy(ordersTable.salesmanId, salesmenTable.salesmanCode)
    .orderBy(desc(count()));
}

export interface BookNowOrderLineItem {
  varietyId: string;
  quantity: number;
}

export interface CreateBookNowOrderParams {
  orderCode: string;
  salesmanId: string;
  customerId: string;
  businessDate: string;
  idempotencyKey?: string;
  notes?: string;
  items: BookNowOrderLineItem[];
}

export async function createBookNowOrderWithGatepassDeduction(
  params: CreateBookNowOrderParams,
): Promise<OrderWithItems> {
  return db.transaction(async (tx) => {
    const { pricedLines, totalQuantity, totalAmount } = await resolvePricedOrderLines(
      tx,
      params.items,
    );

    const [salesmanGatepass] = await tx
      .select()
      .from(gatepassesTable)
      .where(
        and(
          eq(gatepassesTable.salesmanId, params.salesmanId),
          eq(gatepassesTable.businessDate, params.businessDate),
        ),
      )
      .for("update");

    if (!salesmanGatepass || salesmanGatepass.status !== "active") {
      throw new Error("No active gatepass for this salesman today");
    }

    for (const lineItem of pricedLines) {
      const [deductedGatepassItem] = await tx
        .update(gatepassItemsTable)
        .set({ soldQty: sql`${gatepassItemsTable.soldQty} + ${lineItem.quantity}` })
        .where(
          and(
            eq(gatepassItemsTable.gatepassId, salesmanGatepass.id),
            eq(gatepassItemsTable.varietyId, lineItem.varietyId),
            sql`${gatepassItemsTable.issuedQty} - ${gatepassItemsTable.soldQty} >= ${lineItem.quantity}`,
          ),
        )
        .returning();

      if (!deductedGatepassItem) {
        throw new Error(`Variety ${lineItem.varietyId} not allotted or insufficient gatepass quantity`);
      }
    }

    const insertedOrderRows = await tx
      .insert(ordersTable)
      .values({
        orderCode: params.orderCode,
        type: "book_now",
        status: "confirmed",
        salesmanId: params.salesmanId,
        customerId: params.customerId,
        totalQuantity,
        totalAmount,
        placedAt: new Date(),
        idempotencyKey: params.idempotencyKey,
        notes: params.notes,
      })
      .returning();
    const createdOrder = firstOrThrow(insertedOrderRows, "createBookNowOrderWithGatepassDeduction order");

    const createdItems = await tx
      .insert(orderItemsTable)
      .values(
        pricedLines.map((lineItem) => ({
          orderId: createdOrder.id,
          varietyId: lineItem.varietyId,
          quantity: lineItem.quantity,
          unitPrice: lineItem.unitPrice,
        })),
      )
      .returning();

    return { order: createdOrder, items: createdItems };
  });
}

export async function cancelBookNowOrderWithGatepassRestoration(
  orderId: string,
  cancelledBy: string,
): Promise<SelectOrder> {
  return db.transaction(async (tx) => {
    const [existingOrder] = await tx
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .for("update");

    if (!existingOrder) {
      throw new Error(`Order ${orderId} not found`);
    }
    if (existingOrder.fulfilledAt || existingOrder.cancelledAt) {
      throw new Error(`Order ${orderId} cannot be cancelled, it is already fulfilled or cancelled`);
    }

    if (existingOrder.type === "book_now") {
      const businessDate = toIstBusinessDate(existingOrder.placedAt);
      const [salesmanGatepass] = await tx
        .select()
        .from(gatepassesTable)
        .where(
          and(
            eq(gatepassesTable.salesmanId, existingOrder.salesmanId),
            eq(gatepassesTable.businessDate, businessDate),
          ),
        )
        .for("update");

      if (!salesmanGatepass) {
        throw new Error(
          `Cannot restore book_now order ${orderId}, no gatepass found for salesman ${existingOrder.salesmanId} on ${businessDate}`,
        );
      }

      const orderLineItems = await tx
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, orderId));

      for (const lineItem of orderLineItems) {
        const [restoredGatepassItem] = await tx
          .update(gatepassItemsTable)
          .set({ soldQty: sql`${gatepassItemsTable.soldQty} - ${lineItem.quantity}` })
          .where(
            and(
              eq(gatepassItemsTable.gatepassId, salesmanGatepass.id),
              eq(gatepassItemsTable.varietyId, lineItem.varietyId),
              sql`${gatepassItemsTable.soldQty} >= ${lineItem.quantity}`,
            ),
          )
          .returning();

        if (!restoredGatepassItem) {
          throw new Error(
            `Cannot restore ${lineItem.quantity} of variety ${lineItem.varietyId} to gatepass ${salesmanGatepass.id}, sold quantity would go negative`,
          );
        }
      }
    }

    const cancelledOrderRows = await tx
      .update(ordersTable)
      .set({ status: "cancelled", cancelledAt: new Date(), cancelledBy })
      .where(eq(ordersTable.id, orderId))
      .returning();

    return firstOrThrow(cancelledOrderRows, "cancelBookNowOrderWithGatepassRestoration");
  });
}

