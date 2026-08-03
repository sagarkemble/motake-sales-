import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "../../index";
import { orderItemsTable, ordersTable, productVarietiesTable, productsTable } from "../../schema";
import { getEndOfDayTotalsForDate, type GatepassEndOfDayTotals } from "../gatepass";
import { getOrderCountsPerSalesmanInRange, type OrderCountBySalesman } from "../orders";
import { firstOrThrow } from "../shared/assertions";

export interface DailyKpiSummary {
  bookNowOrderCount: number;
  preOrderCount: number;
  fulfilledOrderCount: number;
  gatepassTotals: GatepassEndOfDayTotals;
}

export async function getDailyKpiSummary(
  businessDate: string,
  placedRange: { from: Date; to: Date },
): Promise<DailyKpiSummary> {
  const bookNowRows = await db
    .select({ orderCount: sql<number>`count(*)` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.type, "book_now"),
        gte(ordersTable.placedAt, placedRange.from),
        lte(ordersTable.placedAt, placedRange.to),
      ),
    );

  const preOrderRows = await db
    .select({ orderCount: sql<number>`count(*)` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.type, "pre_order"),
        gte(ordersTable.placedAt, placedRange.from),
        lte(ordersTable.placedAt, placedRange.to),
      ),
    );

  const fulfilledRows = await db
    .select({ orderCount: sql<number>`count(*)` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "fulfilled"),
        gte(ordersTable.fulfilledAt, placedRange.from),
        lte(ordersTable.fulfilledAt, placedRange.to),
      ),
    );

  const gatepassTotals = await getEndOfDayTotalsForDate(businessDate);

  return {
    bookNowOrderCount: firstOrThrow(bookNowRows, "getDailyKpiSummary book now count").orderCount,
    preOrderCount: firstOrThrow(preOrderRows, "getDailyKpiSummary pre-order count").orderCount,
    fulfilledOrderCount: firstOrThrow(fulfilledRows, "getDailyKpiSummary fulfilled count").orderCount,
    gatepassTotals,
  };
}

export interface MonthlyOrderVolume {
  totalOrderCount: number;
  perSalesman: OrderCountBySalesman[];
}

export async function getMonthlyOrderVolume(range: { from: Date; to: Date }): Promise<MonthlyOrderVolume> {
  const perSalesman = await getOrderCountsPerSalesmanInRange(range);
  const totalOrderCount = perSalesman.reduce((runningTotal, row) => runningTotal + row.orderCount, 0);
  return { totalOrderCount, perSalesman };
}

export interface ProductSalesSummaryRow {
  varietyId: string;
  productName: string;
  varietyName: string;
  totalQuantitySold: number;
}

export async function getProductWiseSalesSummary(
  range: { from: Date; to: Date },
): Promise<ProductSalesSummaryRow[]> {
  return db
    .select({
      varietyId: orderItemsTable.varietyId,
      productName: productsTable.name,
      varietyName: productVarietiesTable.name,
      totalQuantitySold: sql<number>`coalesce(sum(${orderItemsTable.quantity}), 0)`,
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .innerJoin(productVarietiesTable, eq(orderItemsTable.varietyId, productVarietiesTable.id))
    .innerJoin(productsTable, eq(productVarietiesTable.productId, productsTable.id))
    .where(and(gte(ordersTable.placedAt, range.from), lte(ordersTable.placedAt, range.to)))
    .groupBy(orderItemsTable.varietyId, productsTable.name, productVarietiesTable.name)
    .orderBy(desc(sql`coalesce(sum(${orderItemsTable.quantity}), 0)`));
}

export async function getAverageFulfillmentDurationSeconds(
  range: { from: Date; to: Date },
): Promise<number | null> {
  const rows = await db
    .select({
      averageSeconds: sql<number | null>`avg(extract(epoch from (${ordersTable.fulfilledAt} - ${ordersTable.placedAt})))`,
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
