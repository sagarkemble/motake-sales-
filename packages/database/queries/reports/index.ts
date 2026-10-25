import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  billItemsTable,
  billsTable,
  ordersTable,
  productVarietiesTable,
  productsTable,
} from "../../schema";
import { billIsNotCancelled } from "../bills/cancelled";
import { getEndOfDayTotalsForDate, type GatepassEndOfDayTotals } from "../gatepass";
import {
  countOrdersPlacedInRange,
  getOrderCountsPerSalesmanInRange,
  type OrderCountBySalesman,
} from "../orders";
import { firstOrThrow } from "../shared/assertions";
import { businessDateOf } from "../shared/business-date";

export interface DailyKpiSummary {
  bookNowOrderCount: number;
  preOrderCount: number;
  fulfilledOrderCount: number;
  salesValuePaise: number;
  gatepassTotals: GatepassEndOfDayTotals;
}

export async function getDailyKpiSummary(
  businessDate: string,
  placedRange: { from: Date; to: Date },
): Promise<DailyKpiSummary> {
  const bookNowRows = await db
    .select({ orderCount: count() })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.type, "book_now"),
        gte(ordersTable.placedAt, placedRange.from),
        lte(ordersTable.placedAt, placedRange.to),
      ),
    );

  const preOrderRows = await db
    .select({ orderCount: count() })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.type, "pre_order"),
        gte(ordersTable.placedAt, placedRange.from),
        lte(ordersTable.placedAt, placedRange.to),
      ),
    );

  const fulfilledRows = await db
    .select({ orderCount: count() })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "fulfilled"),
        gte(ordersTable.fulfilledAt, placedRange.from),
        lte(ordersTable.fulfilledAt, placedRange.to),
      ),
    );

  // Sales value is what was billed that business day, never order totals.
  const salesValueRows = await db
    .select({
      salesValuePaise: sql<number>`coalesce(sum(${billsTable.totalPaise}), 0)::bigint`.mapWith(
        Number,
      ),
    })
    .from(billsTable)
    .where(and(eq(billsTable.billDate, businessDate), billIsNotCancelled()));

  const gatepassTotals = await getEndOfDayTotalsForDate(businessDate);

  return {
    bookNowOrderCount: firstOrThrow(bookNowRows, "getDailyKpiSummary book now count").orderCount,
    preOrderCount: firstOrThrow(preOrderRows, "getDailyKpiSummary pre-order count").orderCount,
    fulfilledOrderCount: firstOrThrow(fulfilledRows, "getDailyKpiSummary fulfilled count")
      .orderCount,
    salesValuePaise: firstOrThrow(salesValueRows, "getDailyKpiSummary sales value").salesValuePaise,
    gatepassTotals,
  };
}

export interface MonthlyOrderVolume {
  totalOrderCount: number;
  perSalesman: OrderCountBySalesman[];
}

export async function getMonthlyOrderVolume(range: {
  from: Date;
  to: Date;
}): Promise<MonthlyOrderVolume> {
  // The total also counts orders with no salesman, which have no per-salesman row.
  const [perSalesman, totalOrderCount] = await Promise.all([
    getOrderCountsPerSalesmanInRange(range),
    countOrdersPlacedInRange({}, range),
  ]);
  return { totalOrderCount, perSalesman };
}

export interface ProductSalesSummaryRow {
  varietyId: string;
  productName: string;
  varietyName: string;
  totalQuantitySold: number;
  taxablePaise: number;
  // CGST + SGST + IGST.
  taxPaise: number;
}

// What shipped on Bills dated within the range (IST business dates); names are the current
// catalog's.
export async function getProductWiseSalesSummary(range: {
  from: Date;
  to: Date;
}): Promise<ProductSalesSummaryRow[]> {
  const quantitySold = sql<number>`coalesce(sum(${billItemsTable.quantity}), 0)::int`;
  return db
    .select({
      varietyId: billItemsTable.varietyId,
      productName: productsTable.name,
      varietyName: productVarietiesTable.name,
      totalQuantitySold: quantitySold,
      taxablePaise: sql<number>`coalesce(sum(${billItemsTable.taxablePaise}), 0)::bigint`.mapWith(
        Number,
      ),
      taxPaise:
        sql<number>`coalesce(sum(${billItemsTable.cgstPaise} + ${billItemsTable.sgstPaise} + ${billItemsTable.igstPaise}), 0)::bigint`.mapWith(
          Number,
        ),
    })
    .from(billItemsTable)
    .innerJoin(billsTable, eq(billItemsTable.billId, billsTable.id))
    .innerJoin(productVarietiesTable, eq(billItemsTable.varietyId, productVarietiesTable.id))
    .innerJoin(productsTable, eq(productVarietiesTable.productId, productsTable.id))
    .where(
      and(
        gte(billsTable.billDate, businessDateOf(range.from)),
        lte(billsTable.billDate, businessDateOf(range.to)),
        billIsNotCancelled(),
      ),
    )
    .groupBy(billItemsTable.varietyId, productsTable.name, productVarietiesTable.name)
    .orderBy(desc(quantitySold));
}

export async function getAverageFulfillmentDurationSeconds(range: {
  from: Date;
  to: Date;
}): Promise<number | null> {
  const rows = await db
    .select({
      averageSeconds: sql<
        number | null
      >`avg(extract(epoch from (${ordersTable.fulfilledAt} - ${ordersTable.placedAt})))::float8`,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "fulfilled"),
        gte(ordersTable.fulfilledAt, range.from),
        lte(ordersTable.fulfilledAt, range.to),
      ),
    );
  return firstOrThrow(rows, "getAverageFulfillmentDurationSeconds").averageSeconds;
}
