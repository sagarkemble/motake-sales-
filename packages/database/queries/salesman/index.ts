import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  billsTable,
  gatepassItemsTable,
  gatepassesTable,
  orderItemsTable,
  ordersTable,
  profilesTable,
  routesTable,
  salesmenTable,
  type InsertSalesman,
  type SelectGatepass,
  type SelectProfile,
  type SelectSalesman,
} from "../../schema";
import { billIsNotCancelled } from "../bills/cancelled";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";
import {
  buildPaginationOffsets,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../shared/pagination";

export interface SalesmanWithProfile {
  salesman: SelectSalesman;
  profile: SelectProfile;
}

// A list row also names the Route of the salesman's Active GatePass for the business date, or null
// without one.
export interface SalesmanListRow extends SalesmanWithProfile {
  activeRouteName: string | null;
}

export async function createSalesman(
  newSalesman: InsertSalesman,
  executor: DbExecutor = db,
): Promise<SelectSalesman> {
  const insertedRows = await executor.insert(salesmenTable).values(newSalesman).returning();
  return firstOrThrow(insertedRows, "createSalesman");
}

export async function getSalesmanById(
  salesmanId: string,
  executor: DbExecutor = db,
): Promise<SelectSalesman | undefined> {
  const [salesman] = await executor
    .select()
    .from(salesmenTable)
    .where(eq(salesmenTable.id, salesmanId));
  return salesman;
}

export async function getSalesmanByCode(salesmanCode: string): Promise<SelectSalesman | undefined> {
  const [salesman] = await db
    .select()
    .from(salesmenTable)
    .where(eq(salesmenTable.salesmanCode, salesmanCode));
  return salesman;
}

export async function getSalesmanWithProfileById(
  salesmanId: string,
): Promise<SalesmanWithProfile | undefined> {
  const [row] = await db
    .select({ salesman: salesmenTable, profile: profilesTable })
    .from(salesmenTable)
    .innerJoin(profilesTable, eq(salesmenTable.id, profilesTable.id))
    .where(eq(salesmenTable.id, salesmanId));
  return row;
}

export async function listSalesmenWithProfiles(
  pagination: PaginationParams,
  businessDate: string,
  includeDeleted = false,
): Promise<PaginatedResult<SalesmanListRow>> {
  const { limit, offset } = buildPaginationOffsets(pagination);
  const whereClause = includeDeleted ? undefined : isNull(profilesTable.deletedAt);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        salesman: salesmenTable,
        profile: profilesTable,
        activeRouteName: routesTable.name,
      })
      .from(salesmenTable)
      .innerJoin(profilesTable, eq(salesmenTable.id, profilesTable.id))
      // At most one active GatePass per salesman and day, as getActiveGatepassWithRoute reads it.
      .leftJoin(
        gatepassesTable,
        and(
          eq(gatepassesTable.salesmanId, salesmenTable.id),
          eq(gatepassesTable.businessDate, businessDate),
          eq(gatepassesTable.status, "active"),
        ),
      )
      .leftJoin(routesTable, eq(gatepassesTable.routeId, routesTable.id))
      .where(whereClause)
      .limit(limit)
      .offset(offset),
    db
      .select({ totalCount: count() })
      .from(salesmenTable)
      .innerJoin(profilesTable, eq(salesmenTable.id, profilesTable.id))
      .where(whereClause),
  ]);

  const { totalCount } = firstOrThrow(countRows, "listSalesmenWithProfiles count");
  return toPaginatedResult(rows, totalCount, pagination);
}

export async function reactivateSalesman(salesmanId: string): Promise<SelectProfile | undefined> {
  const [reactivatedProfile] = await db
    .update(profilesTable)
    .set({ status: "active", deletedAt: null })
    .where(eq(profilesTable.id, salesmanId))
    .returning();
  return reactivatedProfile;
}

export async function updateSalesmanCode(
  salesmanId: string,
  salesmanCode: string,
  executor: DbExecutor = db,
): Promise<SelectSalesman | undefined> {
  const [updatedSalesman] = await executor
    .update(salesmenTable)
    .set({ salesmanCode })
    .where(eq(salesmenTable.id, salesmanId))
    .returning();
  return updatedSalesman;
}

export interface SalesmanDayWiseHistoryRow {
  businessDate: string;
  gatepassStatus: SelectGatepass["status"] | null;
  allottedQty: number;
  soldQty: number;
  returnedQty: number;
  preOrderedQty: number;
  // Bills of this salesman's Book Now orders, by Bill date. Pre-orders have no Bill yet.
  soldAmountPaise: number;
}

export async function getSalesmanDayWiseHistory(
  salesmanId: string,
  dateRange: { from: string; to: string },
): Promise<SalesmanDayWiseHistoryRow[]> {
  const gatepassRows = await db
    .select({
      businessDate: gatepassesTable.businessDate,
      status: gatepassesTable.status,
      allottedQty: sql<number>`coalesce(sum(${gatepassItemsTable.issuedQty}), 0)::int`,
      soldQty: sql<number>`coalesce(sum(${gatepassItemsTable.soldQty}), 0)::int`,
      returnedQty: sql<number>`coalesce(sum(${gatepassItemsTable.returnedQty}), 0)::int`,
    })
    .from(gatepassesTable)
    .leftJoin(gatepassItemsTable, eq(gatepassItemsTable.gatepassId, gatepassesTable.id))
    .where(
      and(
        eq(gatepassesTable.salesmanId, salesmanId),
        gte(gatepassesTable.businessDate, dateRange.from),
        lte(gatepassesTable.businessDate, dateRange.to),
      ),
    )
    .groupBy(gatepassesTable.businessDate, gatepassesTable.status);

  const placedBusinessDate = sql<string>`(${ordersTable.placedAt} AT TIME ZONE 'Asia/Kolkata')::date::text`;
  const preOrderRows = await db
    .select({
      businessDate: placedBusinessDate,
      preOrderedQty: sql<number>`coalesce(sum(${orderItemsTable.quantity}), 0)::int`,
    })
    .from(ordersTable)
    .innerJoin(orderItemsTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.salesmanId, salesmanId),
        eq(ordersTable.type, "pre_order"),
        sql`${ordersTable.status} <> 'cancelled'`,
        sql`${placedBusinessDate} BETWEEN ${dateRange.from} AND ${dateRange.to}`,
      ),
    )
    .groupBy(placedBusinessDate);

  const soldAmountRows = await db
    .select({
      businessDate: billsTable.billDate,
      soldAmountPaise: sql<number>`coalesce(sum(${billsTable.totalPaise}), 0)::bigint`.mapWith(
        Number,
      ),
    })
    .from(billsTable)
    .innerJoin(ordersTable, eq(billsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.salesmanId, salesmanId),
        eq(ordersTable.type, "book_now"),
        billIsNotCancelled(),
        gte(billsTable.billDate, dateRange.from),
        lte(billsTable.billDate, dateRange.to),
      ),
    )
    .groupBy(billsTable.billDate);

  const preOrderedQtyByDate = new Map(
    preOrderRows.map((row) => [row.businessDate, row.preOrderedQty]),
  );
  const soldAmountByDate = new Map(
    soldAmountRows.map((row) => [row.businessDate, row.soldAmountPaise]),
  );

  const dates = new Set<string>([
    ...gatepassRows.map((row) => row.businessDate),
    ...preOrderedQtyByDate.keys(),
    ...soldAmountByDate.keys(),
  ]);

  const gatepassByDate = new Map(gatepassRows.map((row) => [row.businessDate, row]));

  return [...dates].sort().map((businessDate) => {
    const gatepassRow = gatepassByDate.get(businessDate);
    return {
      businessDate,
      gatepassStatus: gatepassRow?.status ?? null,
      allottedQty: gatepassRow?.allottedQty ?? 0,
      soldQty: gatepassRow?.soldQty ?? 0,
      returnedQty: gatepassRow?.returnedQty ?? 0,
      preOrderedQty: preOrderedQtyByDate.get(businessDate) ?? 0,
      soldAmountPaise: soldAmountByDate.get(businessDate) ?? 0,
    };
  });
}
