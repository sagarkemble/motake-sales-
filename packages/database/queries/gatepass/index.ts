import { and, asc, count, desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../../index";
import {
  gatepassItemsTable,
  gatepassesTable,
  productVarietiesTable,
  productsTable,
  profilesTable,
  routesTable,
  salesmenTable,
  type InsertGatepass,
  type InsertGatepassItem,
  type SelectGatepass,
  type SelectGatepassItem,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

// Sellable is issued minus sold, always computed (db-decisions/0009). Returned stock is not part
// of it.
export type GatepassItemWithSellable = SelectGatepassItem & { sellableQty: number };

export function withSellableQty(item: SelectGatepassItem): GatepassItemWithSellable {
  return { ...item, sellableQty: item.issuedQty - item.soldQty };
}

export interface GatepassWithItems {
  gatepass: SelectGatepass;
  items: GatepassItemWithSellable[];
}

// The GatePass Route is fixed at allotment, so reads join it live for its name and code.
export type GatepassWithRoute = SelectGatepass & { routeName: string; routeCode: string };

export interface GatepassWithRouteAndItems {
  gatepass: GatepassWithRoute;
  items: GatepassItemWithSellable[];
}

const gatepassWithRouteColumns = {
  ...getTableColumns(gatepassesTable),
  routeName: routesTable.name,
  routeCode: routesTable.code,
};

export interface ActiveGatepassRoute {
  id: string;
  name: string;
  code: string;
  deliveryState: string;
  hidden: boolean;
}

export interface ActiveGatepassWithRoute {
  gatepass: SelectGatepass;
  route: ActiveGatepassRoute;
}

// The salesman's `active` GatePass on one business date, with its Route.
export async function getActiveGatepassWithRoute(
  salesmanId: string,
  businessDate: string,
  executor: DbExecutor = db,
): Promise<ActiveGatepassWithRoute | undefined> {
  const [row] = await executor
    .select({
      gatepass: gatepassesTable,
      route: {
        id: routesTable.id,
        name: routesTable.name,
        code: routesTable.code,
        deliveryState: routesTable.deliveryState,
        hidden: sql<boolean>`${routesTable.deletedAt} IS NOT NULL`,
      },
    })
    .from(gatepassesTable)
    .innerJoin(routesTable, eq(gatepassesTable.routeId, routesTable.id))
    .where(
      and(
        eq(gatepassesTable.salesmanId, salesmanId),
        eq(gatepassesTable.businessDate, businessDate),
        eq(gatepassesTable.status, "active"),
      ),
    )
    .limit(1);
  return row;
}

// Same as getActiveGatepassWithRoute, locking only the GatePass row: `update` for Book Now (stock
// moves), `share` for writes that must not race a handover (Pre-order place, field Payment).
export async function lockActiveGatepassWithRoute(
  salesmanId: string,
  businessDate: string,
  strength: "update" | "share",
  executor: DbExecutor = db,
): Promise<ActiveGatepassWithRoute | undefined> {
  const [row] = await executor
    .select({
      gatepass: gatepassesTable,
      route: {
        id: routesTable.id,
        name: routesTable.name,
        code: routesTable.code,
        deliveryState: routesTable.deliveryState,
        hidden: sql<boolean>`${routesTable.deletedAt} IS NOT NULL`,
      },
    })
    .from(gatepassesTable)
    .innerJoin(routesTable, eq(gatepassesTable.routeId, routesTable.id))
    .where(
      and(
        eq(gatepassesTable.salesmanId, salesmanId),
        eq(gatepassesTable.businessDate, businessDate),
        eq(gatepassesTable.status, "active"),
      ),
    )
    .limit(1)
    .for(strength, { of: gatepassesTable });
  return row;
}

// One GatePass row by id, locked: `update` before its stock moves (Spec G Cancel restores stock
// only while it is still active), the order a handover takes it in (GatePass, then its lines).
export async function lockGatepassRow(
  gatepassId: string,
  strength: "update" | "share",
  executor: DbExecutor = db,
): Promise<SelectGatepass | undefined> {
  const [gatepass] = await executor
    .select()
    .from(gatepassesTable)
    .where(eq(gatepassesTable.id, gatepassId))
    .for(strength);
  return gatepass;
}

// The GatePass lines for these varieties, locked in variety id order (the checkout lock order).
// A variety not on the GatePass has no row.
export async function lockGatepassItemsForVarieties(
  gatepassId: string,
  varietyIds: string[],
  executor: DbExecutor = db,
): Promise<SelectGatepassItem[]> {
  if (varietyIds.length === 0) return [];
  return executor
    .select()
    .from(gatepassItemsTable)
    .where(
      and(
        eq(gatepassItemsTable.gatepassId, gatepassId),
        inArray(gatepassItemsTable.varietyId, varietyIds),
      ),
    )
    .orderBy(asc(gatepassItemsTable.varietyId))
    .for("update");
}

export async function createGatepassWithItems(
  newGatepass: InsertGatepass,
  itemAllotments: Array<Pick<InsertGatepassItem, "varietyId" | "issuedQty">>,
  executor: DbExecutor = db,
): Promise<GatepassWithItems> {
  return executor.transaction(async (tx) => {
    const insertedGatepassRows = await tx.insert(gatepassesTable).values(newGatepass).returning();
    const createdGatepass = firstOrThrow(insertedGatepassRows, "createGatepassWithItems");
    const createdItems = itemAllotments.length
      ? await tx
          .insert(gatepassItemsTable)
          .values(
            itemAllotments.map((allotment) => ({
              gatepassId: createdGatepass.id,
              varietyId: allotment.varietyId,
              issuedQty: allotment.issuedQty,
            })),
          )
          .returning()
      : [];
    return { gatepass: createdGatepass, items: createdItems.map(withSellableQty) };
  });
}

export async function getGatepassById(
  gatepassId: string,
  executor: DbExecutor = db,
): Promise<SelectGatepass | undefined> {
  const [gatepass] = await executor
    .select()
    .from(gatepassesTable)
    .where(eq(gatepassesTable.id, gatepassId));
  return gatepass;
}

/**
 * Return the salesman's "current" gatepass for the day. A salesman may now hold several
 * gatepasses on the same business date (sequential re-allotment), so we surface the `active`
 * one first and otherwise fall back to the most recently created one (e.g. a
 * pending_verification / closed gatepass awaiting or after admin review).
 */
export async function getGatepassBySalesmanAndDate(
  salesmanId: string,
  businessDate: string,
): Promise<GatepassWithRoute | undefined> {
  const [gatepass] = await db
    .select(gatepassWithRouteColumns)
    .from(gatepassesTable)
    .innerJoin(routesTable, eq(gatepassesTable.routeId, routesTable.id))
    .where(
      and(
        eq(gatepassesTable.salesmanId, salesmanId),
        eq(gatepassesTable.businessDate, businessDate),
      ),
    )
    .orderBy(sql`(${gatepassesTable.status} = 'active') desc`, desc(gatepassesTable.createdAt))
    .limit(1);
  return gatepass;
}

/**
 * Return the salesman's currently-active gatepass for the day, if any. Used to decide whether a
 * fresh gatepass can be allotted (only one active gatepass per salesman per day is allowed).
 */
export async function getActiveGatepassBySalesmanAndDate(
  salesmanId: string,
  businessDate: string,
  executor: DbExecutor = db,
): Promise<SelectGatepass | undefined> {
  const [gatepass] = await executor
    .select()
    .from(gatepassesTable)
    .where(
      and(
        eq(gatepassesTable.salesmanId, salesmanId),
        eq(gatepassesTable.businessDate, businessDate),
        eq(gatepassesTable.status, "active"),
      ),
    )
    .limit(1);
  return gatepass;
}

export async function listGatepassesForDate(businessDate: string): Promise<GatepassWithRoute[]> {
  return db
    .select(gatepassWithRouteColumns)
    .from(gatepassesTable)
    .innerJoin(routesTable, eq(gatepassesTable.routeId, routesTable.id))
    .where(eq(gatepassesTable.businessDate, businessDate))
    .orderBy(desc(gatepassesTable.createdAt));
}

export async function listGatepassItemsByGatepassId(
  gatepassId: string,
): Promise<GatepassItemWithSellable[]> {
  const items = await db
    .select()
    .from(gatepassItemsTable)
    .where(eq(gatepassItemsTable.gatepassId, gatepassId));
  return items.map(withSellableQty);
}

export async function getGatepassItemById(
  gatepassItemId: string,
  executor: DbExecutor = db,
): Promise<SelectGatepassItem | undefined> {
  const [item] = await executor
    .select()
    .from(gatepassItemsTable)
    .where(eq(gatepassItemsTable.id, gatepassItemId));
  return item;
}

export async function getGatepassItemByGatepassAndVariety(
  gatepassId: string,
  varietyId: string,
): Promise<SelectGatepassItem | undefined> {
  const [item] = await db
    .select()
    .from(gatepassItemsTable)
    .where(
      and(
        eq(gatepassItemsTable.gatepassId, gatepassId),
        eq(gatepassItemsTable.varietyId, varietyId),
      ),
    );
  return item;
}

export async function getGatepassWithItemsForSalesmanAndDate(
  salesmanId: string,
  businessDate: string,
): Promise<GatepassWithRouteAndItems | undefined> {
  const gatepass = await getGatepassBySalesmanAndDate(salesmanId, businessDate);
  if (!gatepass) return undefined;
  const items = await listGatepassItemsByGatepassId(gatepass.id);
  return { gatepass, items };
}

export async function incrementSoldQtyIfAvailable(
  gatepassItemId: string,
  quantity: number,
  executor: DbExecutor = db,
): Promise<SelectGatepassItem | undefined> {
  const [updatedItem] = await executor
    .update(gatepassItemsTable)
    .set({ soldQty: sql`${gatepassItemsTable.soldQty} + ${quantity}` })
    .where(
      and(
        eq(gatepassItemsTable.id, gatepassItemId),
        sql`${gatepassItemsTable.issuedQty} - ${gatepassItemsTable.soldQty} >= ${quantity}`,
      ),
    )
    .returning();
  return updatedItem;
}

export async function restoreSoldQtyOnCancellation(
  gatepassItemId: string,
  quantity: number,
  executor: DbExecutor = db,
): Promise<SelectGatepassItem | undefined> {
  const [updatedItem] = await executor
    .update(gatepassItemsTable)
    .set({ soldQty: sql`${gatepassItemsTable.soldQty} - ${quantity}` })
    .where(
      and(
        eq(gatepassItemsTable.id, gatepassItemId),
        sql`${gatepassItemsTable.soldQty} >= ${quantity}`,
      ),
    )
    .returning();
  return updatedItem;
}

export async function recordReturnedQtyForItem(
  gatepassItemId: string,
  returnedQty: number,
  executor: DbExecutor = db,
): Promise<SelectGatepassItem | undefined> {
  const [updatedItem] = await executor
    .update(gatepassItemsTable)
    .set({ returnedQty })
    .where(eq(gatepassItemsTable.id, gatepassItemId))
    .returning();
  return updatedItem;
}

export type GatepassShortReason = "damaged" | "expired" | "lost" | "leaked" | "other";

export interface HandoverItemInput {
  gatepassItemId: string;
  returnedQty: number;
  shortReason?: GatepassShortReason | null;
  shortNote?: string | null;
}

export type SubmitHandoverOutcome =
  | { status: "success"; gatepass: GatepassWithItems }
  | { status: "not_found" }
  | { status: "forbidden" }
  | { status: "not_active" }
  | { status: "invalid"; message: string };

export async function submitHandoverForGatepass(
  gatepassId: string,
  salesmanId: string,
  handoverItems: HandoverItemInput[],
  executor: DbExecutor = db,
): Promise<SubmitHandoverOutcome> {
  return executor.transaction(async (tx) => {
    const lockedGatepassRows = await tx
      .select()
      .from(gatepassesTable)
      .where(eq(gatepassesTable.id, gatepassId))
      .for("update");
    const lockedGatepass = lockedGatepassRows[0];
    if (!lockedGatepass) {
      return { status: "not_found" };
    }
    if (lockedGatepass.salesmanId !== salesmanId) {
      return { status: "forbidden" };
    }
    if (lockedGatepass.status !== "active") {
      return { status: "not_active" };
    }

    const lockedItems = await tx
      .select()
      .from(gatepassItemsTable)
      .where(eq(gatepassItemsTable.gatepassId, gatepassId))
      .for("update");

    const providedById = new Map(handoverItems.map((item) => [item.gatepassItemId, item]));
    const lockedItemIds = new Set(lockedItems.map((item) => item.id));
    for (const provided of handoverItems) {
      if (!lockedItemIds.has(provided.gatepassItemId)) {
        return {
          status: "invalid",
          message: `Gatepass item ${provided.gatepassItemId} does not belong to this gatepass`,
        };
      }
    }

    // Validate every item first so we never commit a partial handover.
    const plannedUpdates: Array<{
      id: string;
      returnedQty: number;
      shortReason: GatepassShortReason | null;
      shortNote: string | null;
    }> = [];
    const settledItems: SelectGatepassItem[] = [];
    for (const item of lockedItems) {
      const remaining = item.issuedQty - item.soldQty;
      if (remaining <= 0) {
        settledItems.push(item);
        continue;
      }

      const provided = providedById.get(item.id);
      const returnedQty = provided ? provided.returnedQty : remaining;
      if (!Number.isInteger(returnedQty) || returnedQty < 0 || returnedQty > remaining) {
        return {
          status: "invalid",
          message: `Returned quantity for item ${item.id} must be between 0 and ${remaining}`,
        };
      }

      const shortfall = remaining - returnedQty;
      const shortReason = shortfall > 0 ? (provided?.shortReason ?? null) : null;
      if (shortfall > 0 && !shortReason) {
        return {
          status: "invalid",
          message: `A reason is required for the ${shortfall} short unit(s) on item ${item.id}`,
        };
      }
      const shortNote = shortfall > 0 ? (provided?.shortNote ?? null) : null;
      plannedUpdates.push({ id: item.id, returnedQty, shortReason, shortNote });
    }

    for (const planned of plannedUpdates) {
      const [updatedItem] = await tx
        .update(gatepassItemsTable)
        .set({
          returnedQty: planned.returnedQty,
          shortReason: planned.shortReason,
          shortNote: planned.shortNote,
        })
        .where(eq(gatepassItemsTable.id, planned.id))
        .returning();
      if (updatedItem) settledItems.push(updatedItem);
    }

    const updatedGatepassRows = await tx
      .update(gatepassesTable)
      .set({ status: "pending_verification", handoverSubmittedAt: new Date() })
      .where(eq(gatepassesTable.id, gatepassId))
      .returning();
    const updatedGatepass = firstOrThrow(updatedGatepassRows, "submitHandoverForGatepass");

    return {
      status: "success",
      gatepass: { gatepass: updatedGatepass, items: settledItems.map(withSellableQty) },
    };
  });
}

export async function updateGatepassStatus(
  gatepassId: string,
  changes: Partial<
    Pick<
      InsertGatepass,
      | "status"
      | "closedBy"
      | "closedAt"
      | "hasDiscrepancy"
      | "discrepancyReason"
      | "handoverSubmittedAt"
      | "notes"
    >
  >,
  executor: DbExecutor = db,
): Promise<SelectGatepass | undefined> {
  const [updatedGatepass] = await executor
    .update(gatepassesTable)
    .set(changes)
    .where(eq(gatepassesTable.id, gatepassId))
    .returning();
  return updatedGatepass;
}

export interface GatepassHistoryRow {
  gatepass: SelectGatepass;
  routeName: string;
  routeCode: string;
  totalIssuedQty: number;
  totalSoldQty: number;
  totalReturnedQty: number;
}

export async function getGatepassHistoryForSalesman(
  salesmanId: string,
): Promise<GatepassHistoryRow[]> {
  return db
    .select({
      gatepass: gatepassesTable,
      routeName: routesTable.name,
      routeCode: routesTable.code,
      totalIssuedQty: sql<number>`coalesce(sum(${gatepassItemsTable.issuedQty}), 0)::int`,
      totalSoldQty: sql<number>`coalesce(sum(${gatepassItemsTable.soldQty}), 0)::int`,
      totalReturnedQty: sql<number>`coalesce(sum(${gatepassItemsTable.returnedQty}), 0)::int`,
    })
    .from(gatepassesTable)
    .innerJoin(routesTable, eq(gatepassesTable.routeId, routesTable.id))
    .leftJoin(gatepassItemsTable, eq(gatepassItemsTable.gatepassId, gatepassesTable.id))
    .where(eq(gatepassesTable.salesmanId, salesmanId))
    .groupBy(gatepassesTable.id, routesTable.id)
    .orderBy(desc(gatepassesTable.businessDate));
}

export interface AllotmentMatrixRow {
  salesmanId: string;
  salesmanCode: string;
  gatepassId: string;
  routeName: string;
  routeCode: string;
  varietyId: string;
  productName: string;
  varietyName: string;
  issuedQty: number;
  soldQty: number;
  sellableQty: number;
  returnedQty: number;
  shortReason: GatepassShortReason | null;
  shortNote: string | null;
}

export async function getAllotmentMatrixForDate(
  businessDate: string,
): Promise<AllotmentMatrixRow[]> {
  return db
    .select({
      salesmanId: gatepassesTable.salesmanId,
      salesmanCode: salesmenTable.salesmanCode,
      gatepassId: gatepassesTable.id,
      routeName: routesTable.name,
      routeCode: routesTable.code,
      varietyId: gatepassItemsTable.varietyId,
      productName: productsTable.name,
      varietyName: productVarietiesTable.name,
      issuedQty: gatepassItemsTable.issuedQty,
      soldQty: gatepassItemsTable.soldQty,
      sellableQty: sql<number>`(${gatepassItemsTable.issuedQty} - ${gatepassItemsTable.soldQty})::int`,
      returnedQty: gatepassItemsTable.returnedQty,
      shortReason: gatepassItemsTable.shortReason,
      shortNote: gatepassItemsTable.shortNote,
    })
    .from(gatepassItemsTable)
    .innerJoin(gatepassesTable, eq(gatepassItemsTable.gatepassId, gatepassesTable.id))
    .innerJoin(salesmenTable, eq(gatepassesTable.salesmanId, salesmenTable.id))
    .innerJoin(routesTable, eq(gatepassesTable.routeId, routesTable.id))
    .innerJoin(productVarietiesTable, eq(gatepassItemsTable.varietyId, productVarietiesTable.id))
    .innerJoin(productsTable, eq(productVarietiesTable.productId, productsTable.id))
    .where(eq(gatepassesTable.businessDate, businessDate))
    .orderBy(asc(salesmenTable.salesmanCode), asc(productsTable.name));
}

export interface GatepassEndOfDayTotals {
  totalIssuedQty: number;
  totalSoldQty: number;
  totalReturnedQty: number;
  discrepancyGatepassCount: number;
}

export async function getEndOfDayTotalsForDate(
  businessDate: string,
): Promise<GatepassEndOfDayTotals> {
  const itemTotalsRows = await db
    .select({
      totalIssuedQty: sql<number>`coalesce(sum(${gatepassItemsTable.issuedQty}), 0)::int`,
      totalSoldQty: sql<number>`coalesce(sum(${gatepassItemsTable.soldQty}), 0)::int`,
      totalReturnedQty: sql<number>`coalesce(sum(${gatepassItemsTable.returnedQty}), 0)::int`,
    })
    .from(gatepassItemsTable)
    .innerJoin(gatepassesTable, eq(gatepassItemsTable.gatepassId, gatepassesTable.id))
    .where(eq(gatepassesTable.businessDate, businessDate));

  const discrepancyRows = await db
    .select({ discrepancyGatepassCount: count() })
    .from(gatepassesTable)
    .where(
      and(eq(gatepassesTable.businessDate, businessDate), eq(gatepassesTable.hasDiscrepancy, true)),
    );

  const itemTotals = firstOrThrow(itemTotalsRows, "getEndOfDayTotalsForDate item totals");
  const { discrepancyGatepassCount } = firstOrThrow(
    discrepancyRows,
    "getEndOfDayTotalsForDate discrepancy count",
  );

  return { ...itemTotals, discrepancyGatepassCount };
}

export interface DiscrepancyGatepassRow {
  gatepassId: string;
  salesmanId: string;
  salesmanCode: string;
  salesmanName: string | null;
  businessDate: string;
  discrepancyReason: string | null;
  handoverSubmittedAt: Date | null;
  closedAt: Date | null;
  closedByName: string | null;
  totalIssuedQty: number;
  totalSoldQty: number;
  totalReturnedQty: number;
  totalShortQty: number;
}

/**
 * Return every flagged (discrepancy) gatepass for a business date with the salesman, the reason,
 * who closed it, and the per-gatepass quantity totals. This is the source of truth for the admin
 * dashboard's discrepancy surface. With multiple gatepasses per salesman/day, each flagged
 * gatepass is reported as its own row (one discrepancy event = one gatepass), and quantity totals
 * are scoped to that gatepass — never summed across the salesman's other gatepasses.
 */
export async function getDiscrepancyGatepassesForDate(
  businessDate: string,
): Promise<DiscrepancyGatepassRow[]> {
  const itemAggregates = db
    .select({
      gatepassId: gatepassItemsTable.gatepassId,
      totalIssuedQty: sql<number>`coalesce(sum(${gatepassItemsTable.issuedQty}), 0)::int`.as(
        "total_issued_qty",
      ),
      totalSoldQty: sql<number>`coalesce(sum(${gatepassItemsTable.soldQty}), 0)::int`.as(
        "total_sold_qty",
      ),
      totalReturnedQty: sql<number>`coalesce(sum(${gatepassItemsTable.returnedQty}), 0)::int`.as(
        "total_returned_qty",
      ),
      totalShortQty:
        sql<number>`coalesce(sum(greatest((${gatepassItemsTable.issuedQty} - ${gatepassItemsTable.soldQty}) - ${gatepassItemsTable.returnedQty}, 0)), 0)::int`.as(
          "total_short_qty",
        ),
    })
    .from(gatepassItemsTable)
    .groupBy(gatepassItemsTable.gatepassId)
    .as("item_aggregates");

  const salesmanProfiles = alias(profilesTable, "salesman_profiles");
  const closedByProfiles = alias(profilesTable, "closed_by_profiles");

  return db
    .select({
      gatepassId: gatepassesTable.id,
      salesmanId: gatepassesTable.salesmanId,
      salesmanCode: salesmenTable.salesmanCode,
      salesmanName: salesmanProfiles.name,
      businessDate: gatepassesTable.businessDate,
      discrepancyReason: gatepassesTable.discrepancyReason,
      handoverSubmittedAt: gatepassesTable.handoverSubmittedAt,
      closedAt: gatepassesTable.closedAt,
      closedByName: closedByProfiles.name,
      totalIssuedQty: sql<number>`coalesce(${itemAggregates.totalIssuedQty}, 0)`,
      totalSoldQty: sql<number>`coalesce(${itemAggregates.totalSoldQty}, 0)`,
      totalReturnedQty: sql<number>`coalesce(${itemAggregates.totalReturnedQty}, 0)`,
      totalShortQty: sql<number>`coalesce(${itemAggregates.totalShortQty}, 0)`,
    })
    .from(gatepassesTable)
    .innerJoin(salesmenTable, eq(gatepassesTable.salesmanId, salesmenTable.id))
    .innerJoin(salesmanProfiles, eq(salesmenTable.id, salesmanProfiles.id))
    .leftJoin(closedByProfiles, eq(gatepassesTable.closedBy, closedByProfiles.id))
    .leftJoin(itemAggregates, eq(itemAggregates.gatepassId, gatepassesTable.id))
    .where(
      and(eq(gatepassesTable.businessDate, businessDate), eq(gatepassesTable.hasDiscrepancy, true)),
    )
    .orderBy(desc(gatepassesTable.closedAt));
}
