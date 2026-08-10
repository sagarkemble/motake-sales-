import { and, count, eq, gte, isNull, lte, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  gatepassItemsTable,
  gatepassesTable,
  orderItemsTable,
  ordersTable,
  profilesTable,
  salesmenTable,
  type InsertSalesman,
  type SelectGatepass,
  type SelectProfile,
  type SelectSalesman,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
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

export async function createSalesman(newSalesman: InsertSalesman): Promise<SelectSalesman> {
  const insertedRows = await db.insert(salesmenTable).values(newSalesman).returning();
  return firstOrThrow(insertedRows, "createSalesman");
}

export async function getSalesmanById(salesmanId: string): Promise<SelectSalesman | undefined> {
  const [salesman] = await db.select().from(salesmenTable).where(eq(salesmenTable.id, salesmanId));
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
  includeDeleted = false,
): Promise<PaginatedResult<SalesmanWithProfile>> {
  const { limit, offset } = buildPaginationOffsets(pagination);
  const whereClause = includeDeleted ? undefined : isNull(profilesTable.deletedAt);

  const [rows, countRows] = await Promise.all([
    db
      .select({ salesman: salesmenTable, profile: profilesTable })
      .from(salesmenTable)
      .innerJoin(profilesTable, eq(salesmenTable.id, profilesTable.id))
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
): Promise<SelectSalesman | undefined> {
  const [updatedSalesman] = await db
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

  const preOrderRows = await db
    .select({
      businessDate: sql<string>`date(${ordersTable.placedAt})`,
      preOrderedQty: sql<number>`coalesce(sum(${orderItemsTable.quantity}), 0)::int`,
    })
    .from(ordersTable)
    .innerJoin(orderItemsTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(
      and(
        eq(ordersTable.salesmanId, salesmanId),
        eq(ordersTable.type, "pre_order"),
        gte(ordersTable.placedAt, sql`${dateRange.from}::date`),
        lte(ordersTable.placedAt, sql`(${dateRange.to}::date + interval '1 day')`),
      ),
    )
    .groupBy(sql`date(${ordersTable.placedAt})`);

  const preOrderedQtyByDate = new Map(
    preOrderRows.map((row) => [row.businessDate, row.preOrderedQty]),
  );

  return gatepassRows.map((row) => ({
    businessDate: row.businessDate,
    gatepassStatus: row.status,
    allottedQty: row.allottedQty,
    soldQty: row.soldQty,
    returnedQty: row.returnedQty,
    preOrderedQty: preOrderedQtyByDate.get(row.businessDate) ?? 0,
  }));
}
