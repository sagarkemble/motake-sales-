import { and, asc, count, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  billsTable,
  customersTable,
  gatepassItemsTable,
  gatepassesTable,
  orderItemsTable,
  ordersTable,
  productVarietiesTable,
  productsTable,
  profilesTable,
  routesTable,
  salesmenTable,
  type InsertOrder,
  type SelectOrder,
  type SelectOrderItem,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import { businessDateOf } from "../shared/business-date";
import {
  buildPaginationOffsets,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../shared/pagination";

export interface OrderLineStamp {
  name: string;
  unit: string;
  hsn: string;
}

export type OrderItem = Omit<SelectOrderItem, "stamp"> & { stamp: OrderLineStamp };

export interface OrderWithItems {
  order: SelectOrder;
  items: OrderItem[];
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
    const { pricedLines, totalQuantity, totalAmount } = await resolvePricedOrderLines(
      tx,
      lineItems,
    );
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

export async function getOrderByIdempotencyKey(
  idempotencyKey: string,
): Promise<SelectOrder | undefined> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.idempotencyKey, idempotencyKey));
  return order;
}

export async function listOrderItemsByOrderId(orderId: string): Promise<OrderItem[]> {
  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId))
    .orderBy(asc(orderItemsTable.createdAt), asc(orderItemsTable.id));
  return items.map((item) => ({ ...item, stamp: item.stamp as OrderLineStamp }));
}

export async function getOrderWithItemsById(orderId: string): Promise<OrderWithItems | undefined> {
  const order = await getOrderById(orderId);
  if (!order) return undefined;
  const items = await listOrderItemsByOrderId(orderId);
  return { order, items };
}

export interface OrderBillSummary {
  id: string;
  number: string;
  totalPaise: number;
}

export interface OrderDetailItem {
  varietyId: string;
  productName: string;
  stamp: OrderLineStamp;
  quantity: number;
  routePricePaise: number;
  exempt: boolean;
  gstRateBps: number;
  imageUrl: string | null;
}

export interface OrderDetail {
  order: SelectOrder;
  customer: {
    shopName: string;
    contactName: string | null;
    phone: string;
    address: string;
    shopPhotoUrl: string | null;
  };
  routeName: string;
  routeCode: string;
  salesmanCode: string | null;
  salesmanName: string | null;
  fulfilledBySalesmanName: string | null;
  totalQuantity: number;
  bill: OrderBillSummary | null;
  items: OrderDetailItem[];
}

const billSummaryColumns = {
  billId: billsTable.id,
  billNumber: billsTable.number,
  billTotalPaise: billsTable.totalPaise,
};

function toBillSummary(row: {
  billId: string | null;
  billNumber: string | null;
  billTotalPaise: number | null;
}): OrderBillSummary | null {
  if (!row.billId || !row.billNumber || row.billTotalPaise === null) return null;
  return { id: row.billId, number: row.billNumber, totalPaise: row.billTotalPaise };
}

// Qualified by hand: Drizzle drops table names in single-table selects, which would bind
// the correlated "id" to order_items.
const orderQuantity = sql<number>`(
  SELECT coalesce(sum("order_items"."quantity"), 0)::int FROM "order_items"
  WHERE "order_items"."order_id" = "orders"."id"
)`;

export async function getOrderDetailById(orderId: string): Promise<OrderDetail | undefined> {
  const [headerRow] = await db
    .select({
      order: ordersTable,
      customer: {
        shopName: customersTable.shopName,
        contactName: customersTable.contactName,
        phone: customersTable.phone,
        address: customersTable.address,
        shopPhotoUrl: customersTable.shopPhotoUrl,
      },
      routeName: routesTable.name,
      routeCode: routesTable.code,
      salesmanCode: salesmenTable.salesmanCode,
      salesmanName: profilesTable.name,
      totalQuantity: orderQuantity,
      ...billSummaryColumns,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .innerJoin(routesTable, eq(ordersTable.routeId, routesTable.id))
    .leftJoin(salesmenTable, eq(ordersTable.salesmanId, salesmenTable.id))
    .leftJoin(profilesTable, eq(salesmenTable.id, profilesTable.id))
    .leftJoin(billsTable, eq(billsTable.orderId, ordersTable.id))
    .where(eq(ordersTable.id, orderId));
  if (!headerRow) return undefined;

  const itemRows = await db
    .select({
      varietyId: orderItemsTable.varietyId,
      productName: productsTable.name,
      stamp: orderItemsTable.stamp,
      quantity: orderItemsTable.quantity,
      routePricePaise: orderItemsTable.routePricePaise,
      exempt: orderItemsTable.exempt,
      gstRateBps: orderItemsTable.gstRateBps,
      imageUrl: productsTable.imageUrl,
    })
    .from(orderItemsTable)
    .innerJoin(productVarietiesTable, eq(orderItemsTable.varietyId, productVarietiesTable.id))
    .innerJoin(productsTable, eq(productVarietiesTable.productId, productsTable.id))
    .where(eq(orderItemsTable.orderId, orderId))
    .orderBy(asc(orderItemsTable.createdAt), asc(orderItemsTable.id));

  let fulfilledBySalesmanName: string | null = null;
  if (headerRow.order.fulfilledBy) {
    const fulfilledByRows = await db
      .select({ name: profilesTable.name })
      .from(profilesTable)
      .where(eq(profilesTable.id, headerRow.order.fulfilledBy));
    fulfilledBySalesmanName = fulfilledByRows[0]?.name ?? null;
  }

  return {
    order: headerRow.order,
    customer: headerRow.customer,
    routeName: headerRow.routeName,
    routeCode: headerRow.routeCode,
    salesmanCode: headerRow.salesmanCode,
    salesmanName: headerRow.salesmanName,
    fulfilledBySalesmanName,
    totalQuantity: headerRow.totalQuantity,
    bill: toBillSummary(headerRow),
    items: itemRows.map((itemRow) => ({ ...itemRow, stamp: itemRow.stamp as OrderLineStamp })),
  };
}

const OPEN_ORDER_STATUSES = ["scheduled", "due", "confirmed"] as const;

export interface OpenOrderSummary {
  id: string;
  type: SelectOrder["type"];
  status: SelectOrder["status"];
  totalQuantity: number;
  scheduledDate: string | null;
  placedAt: Date;
}

export async function listOpenOrdersByCustomerId(customerId: string): Promise<OpenOrderSummary[]> {
  return db
    .select({
      id: ordersTable.id,
      type: ordersTable.type,
      status: ordersTable.status,
      totalQuantity: orderQuantity,
      scheduledDate: ordersTable.scheduledDate,
      placedAt: ordersTable.placedAt,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.customerId, customerId),
        inArray(ordersTable.status, [...OPEN_ORDER_STATUSES]),
      ),
    )
    .orderBy(asc(ordersTable.scheduledDate), asc(ordersTable.placedAt));
}

export async function countOpenOrdersByCustomerId(customerId: string): Promise<number> {
  const [countRow] = await db
    .select({ totalCount: count() })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.customerId, customerId),
        inArray(ordersTable.status, [...OPEN_ORDER_STATUSES]),
      ),
    );
  return countRow?.totalCount ?? 0;
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
  id: string;
  type: SelectOrder["type"];
  status: SelectOrder["status"];
  customerId: string;
  customerShopName: string;
  customerPhone: string;
  customerShopPhotoUrl: string | null;
  salesmanId: string | null;
  salesmanCode: string | null;
  salesmanName: string | null;
  routeId: string;
  routeName: string;
  routeCode: string;
  totalQuantity: number;
  scheduledDate: string | null;
  placedAt: Date;
  fulfilledAt: Date | null;
  cancelledAt: Date | null;
  bill: OrderBillSummary | null;
  itemPreviews: OrderItemPreview[];
}

async function attachItemPreviews(
  rows: Omit<OrderListRow, "itemPreviews">[],
): Promise<OrderListRow[]> {
  if (rows.length === 0) return [];

  const orderIds = rows.map((row) => row.id);
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
    itemPreviews: (itemPreviewsByOrderId.get(row.id) ?? []).slice(0, 4),
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
        id: ordersTable.id,
        type: ordersTable.type,
        status: ordersTable.status,
        customerId: ordersTable.customerId,
        customerShopName: customersTable.shopName,
        customerPhone: customersTable.phone,
        customerShopPhotoUrl: customersTable.shopPhotoUrl,
        salesmanId: ordersTable.salesmanId,
        salesmanCode: salesmenTable.salesmanCode,
        salesmanName: profilesTable.name,
        routeId: ordersTable.routeId,
        routeName: routesTable.name,
        routeCode: routesTable.code,
        totalQuantity: orderQuantity,
        scheduledDate: ordersTable.scheduledDate,
        placedAt: ordersTable.placedAt,
        fulfilledAt: ordersTable.fulfilledAt,
        cancelledAt: ordersTable.cancelledAt,
        ...billSummaryColumns,
      })
      .from(ordersTable)
      .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
      .innerJoin(routesTable, eq(ordersTable.routeId, routesTable.id))
      .leftJoin(salesmenTable, eq(ordersTable.salesmanId, salesmenTable.id))
      .leftJoin(profilesTable, eq(salesmenTable.id, profilesTable.id))
      .leftJoin(billsTable, eq(billsTable.orderId, ordersTable.id))
      .where(whereClause)
      .orderBy(desc(ordersTable.placedAt), desc(ordersTable.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ totalCount: count() })
      .from(ordersTable)
      .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
      .where(whereClause),
  ]);

  const { totalCount } = firstOrThrow(countRows, "listOrders count");
  const rowsWithItemPreviews = await attachItemPreviews(
    rows.map(({ billId, billNumber, billTotalPaise, ...row }) => ({
      ...row,
      bill: toBillSummary({ billId, billNumber, billTotalPaise }),
    })),
  );
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
      and(
        eq(ordersTable.id, orderId),
        isNull(ordersTable.fulfilledAt),
        isNull(ordersTable.cancelledAt),
      ),
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

// Orders with no salesman (placed from the office) have no per-salesman row.
export async function getOrderCountsPerSalesmanInRange(range: {
  from: Date;
  to: Date;
}): Promise<OrderCountBySalesman[]> {
  return db
    .select({
      salesmanId: salesmenTable.id,
      salesmanCode: salesmenTable.salesmanCode,
      orderCount: count(),
    })
    .from(ordersTable)
    .innerJoin(salesmenTable, eq(ordersTable.salesmanId, salesmenTable.id))
    .where(and(gte(ordersTable.placedAt, range.from), lte(ordersTable.placedAt, range.to)))
    .groupBy(salesmenTable.id, salesmenTable.salesmanCode)
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

    // A salesman may hold several gatepasses on the same day, but only one is ever `active`.
    // Deduct from that active gatepass explicitly (there is at most one, enforced by a partial
    // unique index) rather than an arbitrary row for the salesman/date.
    const [salesmanGatepass] = await tx
      .select()
      .from(gatepassesTable)
      .where(
        and(
          eq(gatepassesTable.salesmanId, params.salesmanId),
          eq(gatepassesTable.businessDate, params.businessDate),
          eq(gatepassesTable.status, "active"),
        ),
      )
      .for("update");

    if (!salesmanGatepass) {
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
        throw new Error(
          `Variety ${lineItem.varietyId} not allotted or insufficient gatepass quantity`,
        );
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
    const createdOrder = firstOrThrow(
      insertedOrderRows,
      "createBookNowOrderWithGatepassDeduction order",
    );

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
      const businessDate = businessDateOf(existingOrder.placedAt);
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
