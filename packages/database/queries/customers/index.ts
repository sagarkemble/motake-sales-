import { and, asc, count, eq, ilike, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  customersTable,
  ordersTable,
  type InsertCustomer,
  type SelectCustomer,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import {
  buildPaginationOffsets,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../shared/pagination";

export async function createCustomer(newCustomer: InsertCustomer): Promise<SelectCustomer> {
  const insertedRows = await db.insert(customersTable).values(newCustomer).returning();
  return firstOrThrow(insertedRows, "createCustomer");
}

export async function getCustomerById(customerId: string): Promise<SelectCustomer | undefined> {
  const [customer] = await db.select().from(customersTable).where(eq(customersTable.id, customerId));
  return customer;
}

export async function findActiveCustomerByPhone(
  phone: string,
): Promise<SelectCustomer | undefined> {
  const [customer] = await db
    .select()
    .from(customersTable)
    .where(and(eq(customersTable.phone, phone), isNull(customersTable.deletedAt)));
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
  options: { includeInactive?: boolean } = {},
): Promise<PaginatedResult<SelectCustomer>> {
  const { limit, offset } = buildPaginationOffsets(pagination);
  const searchClause = searchTerm
    ? or(
        ilike(customersTable.shopName, `%${searchTerm}%`),
        ilike(customersTable.contactName, `%${searchTerm}%`),
        ilike(customersTable.phone, `%${searchTerm}%`),
      )
    : undefined;
  const whereClause = and(
    options.includeInactive ? undefined : isNull(customersTable.deletedAt),
    searchClause,
  );

  const [items, countRows] = await Promise.all([
    db
      .select()
      .from(customersTable)
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
): Promise<PaginatedResult<SelectCustomer>> {
  return searchCustomers(searchTerm, pagination, { includeInactive: false });
}

export async function updateCustomer(
  customerId: string,
  changes: Partial<InsertCustomer>,
): Promise<SelectCustomer | undefined> {
  const [updatedCustomer] = await db
    .update(customersTable)
    .set(changes)
    .where(eq(customersTable.id, customerId))
    .returning();
  return updatedCustomer;
}

export interface CustomerStats {
  totalOrderCount: number;
  totalQuantitySold: number;
  lifetimeValue: number;
  lastOrderAt: Date | null;
}

export async function getCustomerStats(customerId: string): Promise<CustomerStats> {
  const [statsRow] = await db
    .select({
      totalOrderCount: count(),
      totalQuantitySold: sql<number>`coalesce(sum(${ordersTable.totalQuantity}), 0)::int`,
      lifetimeValue: sql<number>`coalesce(sum(${ordersTable.totalAmount}), 0)::float8`,
      lastOrderAt: sql<string | null>`max(${ordersTable.placedAt})`,
    })
    .from(ordersTable)
    .where(and(eq(ordersTable.customerId, customerId), ne(ordersTable.status, "cancelled")));

  if (!statsRow) {
    return { totalOrderCount: 0, totalQuantitySold: 0, lifetimeValue: 0, lastOrderAt: null };
  }

  return {
    ...statsRow,
    lastOrderAt: statsRow.lastOrderAt ? new Date(statsRow.lastOrderAt) : null,
  };
}

export async function softDeleteCustomer(customerId: string): Promise<SelectCustomer | undefined> {
  const [deletedCustomer] = await db
    .update(customersTable)
    .set({ deletedAt: new Date(), status: "inactive" })
    .where(eq(customersTable.id, customerId))
    .returning();
  return deletedCustomer;
}

export async function reactivateCustomer(customerId: string): Promise<SelectCustomer | undefined> {
  const [reactivatedCustomer] = await db
    .update(customersTable)
    .set({ deletedAt: null, status: "active" })
    .where(eq(customersTable.id, customerId))
    .returning();
  return reactivatedCustomer;
}
