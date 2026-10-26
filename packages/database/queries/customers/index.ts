import {
  and,
  asc,
  count,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../../index";
import {
  billsTable,
  customersTable,
  ordersTable,
  routesTable,
  type InsertCustomer,
  type SelectCustomer,
} from "../../schema";
import { billCustomerId } from "../bills";
import { billIsNotCancelled } from "../bills/cancelled";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";
import {
  buildPaginationOffsets,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../shared/pagination";

// A Customer with its live Route name and code; a hidden Route is still shown, labelled.
export type CustomerWithRoute = SelectCustomer & {
  routeName: string;
  routeCode: string;
  routeHidden: boolean;
};

const customerWithRouteColumns = {
  ...getTableColumns(customersTable),
  routeName: routesTable.name,
  routeCode: routesTable.code,
  routeHidden: sql<boolean>`${routesTable.deletedAt} IS NOT NULL`,
};

export async function createCustomer(
  newCustomer: InsertCustomer,
  executor: DbExecutor = db,
): Promise<SelectCustomer> {
  const insertedRows = await executor.insert(customersTable).values(newCustomer).returning();
  return firstOrThrow(insertedRows, "createCustomer");
}

export async function getCustomerWithRouteById(
  customerId: string,
  executor: DbExecutor = db,
): Promise<CustomerWithRoute | undefined> {
  const [customer] = await executor
    .select(customerWithRouteColumns)
    .from(customersTable)
    .innerJoin(routesTable, eq(customersTable.routeId, routesTable.id))
    .where(eq(customersTable.id, customerId));
  return customer;
}

export async function lockCustomerRow(
  customerId: string,
  executor: DbExecutor = db,
): Promise<SelectCustomer | undefined> {
  const [customer] = await executor
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, customerId))
    .for("update");
  return customer;
}

// Pre-orders still to be fulfilled for this Customer.
export async function countOpenPreordersForCustomer(
  customerId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({ total: count() })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.customerId, customerId),
        eq(ordersTable.type, "pre_order"),
        inArray(ordersTable.status, ["scheduled", "due"]),
      ),
    );
  return row?.total ?? 0;
}

export async function getCustomerById(
  customerId: string,
  executor: DbExecutor = db,
): Promise<SelectCustomer | undefined> {
  const [customer] = await executor
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, customerId));
  return customer;
}

export async function listActiveCustomersByIds(customerIds: string[]): Promise<SelectCustomer[]> {
  if (customerIds.length === 0) return [];
  return db
    .select()
    .from(customersTable)
    .where(and(inArray(customersTable.id, customerIds), isNull(customersTable.deletedAt)));
}

export async function searchCustomers(
  searchTerm: string | undefined,
  pagination: PaginationParams,
  options: { includeInactive?: boolean; routeId?: string } = {},
): Promise<PaginatedResult<CustomerWithRoute>> {
  const { limit, offset } = buildPaginationOffsets(pagination);
  const searchClause = searchTerm
    ? or(
        ilike(customersTable.shopName, `%${searchTerm}%`),
        ilike(customersTable.contactName, `%${searchTerm}%`),
        ilike(customersTable.phone, `%${searchTerm}%`),
        ilike(customersTable.address, `%${searchTerm}%`),
      )
    : undefined;
  const whereClause = and(
    options.includeInactive ? undefined : isNull(customersTable.deletedAt),
    options.routeId ? eq(customersTable.routeId, options.routeId) : undefined,
    searchClause,
  );

  const [items, countRows] = await Promise.all([
    db
      .select(customerWithRouteColumns)
      .from(customersTable)
      .innerJoin(routesTable, eq(customersTable.routeId, routesTable.id))
      .where(whereClause)
      .orderBy(asc(customersTable.shopName))
      .limit(limit)
      .offset(offset),
    db.select({ totalCount: count() }).from(customersTable).where(whereClause),
  ]);

  const { totalCount } = firstOrThrow(countRows, "searchCustomers count");
  return toPaginatedResult(items, totalCount, pagination);
}

/** @deprecated Prefer searchCustomers — kept for callers that expect the old name */
export async function searchActiveCustomers(
  searchTerm: string | undefined,
  pagination: PaginationParams,
): Promise<PaginatedResult<CustomerWithRoute>> {
  return searchCustomers(searchTerm, pagination, { includeInactive: false });
}

export async function updateCustomer(
  customerId: string,
  changes: Partial<InsertCustomer>,
  executor: DbExecutor = db,
): Promise<SelectCustomer | undefined> {
  const [updatedCustomer] = await executor
    .update(customersTable)
    .set(changes)
    .where(eq(customersTable.id, customerId))
    .returning();
  return updatedCustomer;
}

export interface CustomerStats {
  // Orders that are not cancelled, billed or not.
  totalOrderCount: number;
  billedQuantity: number;
  // Gross Bill totals; Notes do not adjust them yet.
  lifetimeValuePaise: number;
  lastOrderAt: Date | null;
}

export async function getCustomerStats(customerId: string): Promise<CustomerStats> {
  const [orderRow] = await db
    .select({
      totalOrderCount: count(),
      lastOrderAt: sql<string | null>`max(${ordersTable.placedAt})`,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.customerId, customerId), ne(ordersTable.status, "cancelled")));

  // Same Customer rule as Bill reads (Ledger Bill debit, else the order), so office Bills count.
  const [billRow] = await db
    .select({
      billedQuantity: sql<number>`coalesce(sum(${billsTable.totalQuantity}), 0)::int`,
      lifetimeValuePaise: sql<number>`coalesce(sum(${billsTable.totalPaise}), 0)::bigint`.mapWith(
        Number,
      ),
    })
    .from(billsTable)
    .where(and(sql`${billCustomerId} = ${customerId}`, billIsNotCancelled()));

  return {
    totalOrderCount: orderRow?.totalOrderCount ?? 0,
    billedQuantity: billRow?.billedQuantity ?? 0,
    lifetimeValuePaise: billRow?.lifetimeValuePaise ?? 0,
    lastOrderAt: orderRow?.lastOrderAt ? new Date(orderRow.lastOrderAt) : null,
  };
}

export async function softDeleteCustomer(
  customerId: string,
  executor: DbExecutor = db,
): Promise<SelectCustomer | undefined> {
  const [deletedCustomer] = await executor
    .update(customersTable)
    .set({ deletedAt: new Date(), status: "inactive" })
    .where(eq(customersTable.id, customerId))
    .returning();
  return deletedCustomer;
}

export async function reactivateCustomer(
  customerId: string,
  executor: DbExecutor = db,
): Promise<SelectCustomer | undefined> {
  const [reactivatedCustomer] = await executor
    .update(customersTable)
    .set({ deletedAt: null, status: "active" })
    .where(eq(customersTable.id, customerId))
    .returning();
  return reactivatedCustomer;
}
