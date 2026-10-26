import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  billsTable,
  customersTable,
  orderItemsTable,
  ordersTable,
  orderVersionsTable,
  productVarietiesTable,
  productsTable,
  profilesTable,
  routesTable,
  salesmenTable,
  type InsertOrder,
  type InsertOrderItem,
  type InsertOrderVersion,
  type SelectOrder,
  type SelectOrderItem,
  type SelectOrderVersion,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";
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

export async function getOrderById(orderId: string): Promise<SelectOrder | undefined> {
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId));
  return order;
}

export async function getOrderByIdempotencyKey(
  idempotencyKey: string,
  executor: DbExecutor = db,
): Promise<SelectOrder | undefined> {
  const [order] = await executor
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.idempotencyKey, idempotencyKey));
  return order;
}

export async function listOrderItemsByOrderId(
  orderId: string,
  executor: DbExecutor = db,
): Promise<OrderItem[]> {
  const items = await executor
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

// Open means a Pre-order still waiting to be fulfilled or cancelled. A Book Now is billed on the
// spot (status confirmed) and never stays open.
const OPEN_PREORDER_STATUSES = ["scheduled", "due"] as const;

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
        eq(ordersTable.type, "pre_order"),
        inArray(ordersTable.status, [...OPEN_PREORDER_STATUSES]),
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
        eq(ordersTable.type, "pre_order"),
        inArray(ordersTable.status, [...OPEN_PREORDER_STATUSES]),
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

// --- Checkout write path (Spec F): place, fulfil and their order_versions.

export async function lockOrderRow(
  orderId: string,
  executor: DbExecutor = db,
): Promise<SelectOrder | undefined> {
  const [order] = await executor
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .for("update");
  return order;
}

export async function insertOrder(
  newOrder: InsertOrder,
  executor: DbExecutor = db,
): Promise<SelectOrder> {
  const insertedRows = await executor.insert(ordersTable).values(newOrder).returning();
  return firstOrThrow(insertedRows, "insertOrder");
}

export async function insertOrderItems(
  newItems: InsertOrderItem[],
  executor: DbExecutor = db,
): Promise<OrderItem[]> {
  const items = await executor.insert(orderItemsTable).values(newItems).returning();
  return items.map((item) => ({ ...item, stamp: item.stamp as OrderLineStamp }));
}

export async function updateOrder(
  orderId: string,
  changes: Partial<
    Pick<
      InsertOrder,
      "status" | "fulfilledAt" | "fulfilledBy" | "gatepassId" | "cancelledAt" | "cancelledBy"
    >
  >,
  executor: DbExecutor = db,
): Promise<SelectOrder> {
  const updatedRows = await executor
    .update(ordersTable)
    .set(changes)
    .where(eq(ordersTable.id, orderId))
    .returning();
  return firstOrThrow(updatedRows, "updateOrder");
}

export async function insertOrderVersion(
  newVersion: InsertOrderVersion,
  executor: DbExecutor = db,
): Promise<SelectOrderVersion> {
  const insertedRows = await executor.insert(orderVersionsTable).values(newVersion).returning();
  return firstOrThrow(insertedRows, "insertOrderVersion");
}

export async function getLatestOrderVersion(
  orderId: string,
  executor: DbExecutor = db,
): Promise<SelectOrderVersion | undefined> {
  const [version] = await executor
    .select()
    .from(orderVersionsTable)
    .where(eq(orderVersionsTable.orderId, orderId))
    .orderBy(desc(orderVersionsTable.versionNumber))
    .limit(1);
  return version;
}

export interface RoutePreorderLine {
  varietyId: string;
  name: string;
  unit: string;
  quantity: number;
}

export interface RoutePreorderRow {
  id: string;
  status: SelectOrder["status"];
  scheduledDate: string;
  placedAt: Date;
  customerId: string;
  customerShopName: string;
  customerPhone: string;
  customerShopPhotoUrl: string | null;
  placedBySalesmanId: string | null;
  placedByName: string | null;
  totalQuantity: number;
  lines: RoutePreorderLine[];
}

// Open Pre-orders on one Route, any salesman, earliest scheduled date first. Legacy `due` rows
// count as open; due / overdue are derived on read.
export async function listOpenPreordersOnRoute(
  routeId: string,
  executor: DbExecutor = db,
): Promise<RoutePreorderRow[]> {
  const rows = await executor
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
      scheduledDate: ordersTable.scheduledDate,
      placedAt: ordersTable.placedAt,
      customerId: ordersTable.customerId,
      customerShopName: customersTable.shopName,
      customerPhone: customersTable.phone,
      customerShopPhotoUrl: customersTable.shopPhotoUrl,
      placedBySalesmanId: ordersTable.salesmanId,
      placedByName: profilesTable.name,
      totalQuantity: orderQuantity,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .leftJoin(profilesTable, eq(ordersTable.salesmanId, profilesTable.id))
    .where(
      and(
        eq(ordersTable.routeId, routeId),
        eq(ordersTable.type, "pre_order"),
        inArray(ordersTable.status, ["scheduled", "due"]),
      ),
    )
    .orderBy(asc(ordersTable.scheduledDate), asc(ordersTable.placedAt), asc(ordersTable.id));
  const linesByOrderId = await listPreorderLines(
    rows.map((row) => row.id),
    executor,
  );
  return rows.map((row) => ({
    ...row,
    // Every Pre-order has a scheduled date.
    scheduledDate: row.scheduledDate ?? "",
    lines: linesByOrderId.get(row.id) ?? [],
  }));
}

async function listPreorderLines(
  orderIds: string[],
  executor: DbExecutor,
): Promise<Map<string, RoutePreorderLine[]>> {
  const linesByOrderId = new Map<string, RoutePreorderLine[]>();
  if (orderIds.length === 0) return linesByOrderId;
  const itemRows = await executor
    .select({
      orderId: orderItemsTable.orderId,
      varietyId: orderItemsTable.varietyId,
      stamp: orderItemsTable.stamp,
      quantity: orderItemsTable.quantity,
    })
    .from(orderItemsTable)
    .where(inArray(orderItemsTable.orderId, orderIds))
    .orderBy(asc(orderItemsTable.createdAt), asc(orderItemsTable.id));
  for (const itemRow of itemRows) {
    const stamp = itemRow.stamp as OrderLineStamp;
    const lines = linesByOrderId.get(itemRow.orderId) ?? [];
    lines.push({
      varietyId: itemRow.varietyId,
      name: stamp.name,
      unit: stamp.unit,
      quantity: itemRow.quantity,
    });
    linesByOrderId.set(itemRow.orderId, lines);
  }
  return linesByOrderId;
}

export interface CustomerPreorderRow {
  id: string;
  status: SelectOrder["status"];
  scheduledDate: string;
  placedAt: Date;
  // The place-time Route stamp carried in the latest order version.
  route: { name: string; code: string; delivery_state: string } | null;
  placedByName: string | null;
  totalQuantity: number;
  lines: RoutePreorderLine[];
}

// One Customer's unfulfilled Pre-orders (Spec G's Open Pre-orders list beside the Ledger),
// earliest scheduled date first. Never Ledger rows.
export async function listOpenPreordersForCustomer(
  customerId: string,
  executor: DbExecutor = db,
): Promise<CustomerPreorderRow[]> {
  const rows = await executor
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
      scheduledDate: ordersTable.scheduledDate,
      placedAt: ordersTable.placedAt,
      route: sql<CustomerPreorderRow["route"]>`(
        SELECT "order_versions"."header" -> 'route' FROM "order_versions"
        WHERE "order_versions"."order_id" = "orders"."id"
        ORDER BY "order_versions"."version_number" DESC LIMIT 1
      )`,
      placedByName: profilesTable.name,
      totalQuantity: orderQuantity,
    })
    .from(ordersTable)
    .leftJoin(profilesTable, eq(ordersTable.salesmanId, profilesTable.id))
    .where(
      and(
        eq(ordersTable.customerId, customerId),
        eq(ordersTable.type, "pre_order"),
        inArray(ordersTable.status, [...OPEN_PREORDER_STATUSES]),
      ),
    )
    .orderBy(asc(ordersTable.scheduledDate), asc(ordersTable.placedAt), asc(ordersTable.id));
  const linesByOrderId = await listPreorderLines(
    rows.map((row) => row.id),
    executor,
  );
  return rows.map((row) => ({
    ...row,
    scheduledDate: row.scheduledDate ?? "",
    lines: linesByOrderId.get(row.id) ?? [],
  }));
}
