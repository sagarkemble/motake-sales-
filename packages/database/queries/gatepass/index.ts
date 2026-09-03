import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../../index";
import {
  gatepassItemsTable,
  gatepassesTable,
  productVarietiesTable,
  productsTable,
  profilesTable,
  salesmenTable,
  type InsertGatepass,
  type InsertGatepassItem,
  type SelectGatepass,
  type SelectGatepassItem,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";

export interface GatepassWithItems {
  gatepass: SelectGatepass;
  items: SelectGatepassItem[];
}

export async function createGatepassWithItems(
  newGatepass: InsertGatepass,
  itemAllotments: Array<Pick<InsertGatepassItem, "varietyId" | "issuedQty">>,
): Promise<GatepassWithItems> {
  return db.transaction(async (tx) => {
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
    return { gatepass: createdGatepass, items: createdItems };
  });
}

export async function getGatepassById(gatepassId: string): Promise<SelectGatepass | undefined> {
  const [gatepass] = await db
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
): Promise<SelectGatepass | undefined> {
  const [gatepass] = await db
    .select()
    .from(gatepassesTable)
    .where(
      and(
        eq(gatepassesTable.salesmanId, salesmanId),
        eq(gatepassesTable.businessDate, businessDate),
      ),
    )
    .orderBy(
      sql`(${gatepassesTable.status} = 'active') desc`,
      desc(gatepassesTable.createdAt),
    )
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
): Promise<SelectGatepass | undefined> {
  const [gatepass] = await db
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

export async function listGatepassesForDate(businessDate: string): Promise<SelectGatepass[]> {
  return db
    .select()
    .from(gatepassesTable)
    .where(eq(gatepassesTable.businessDate, businessDate))
    .orderBy(desc(gatepassesTable.createdAt));
}

export async function listGatepassItemsByGatepassId(
  gatepassId: string,
): Promise<SelectGatepassItem[]> {
  return db.select().from(gatepassItemsTable).where(eq(gatepassItemsTable.gatepassId, gatepassId));
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
): Promise<GatepassWithItems | undefined> {
  const gatepass = await getGatepassBySalesmanAndDate(salesmanId, businessDate);
  if (!gatepass) return undefined;
  const items = await listGatepassItemsByGatepassId(gatepass.id);
  return { gatepass, items };
}

export async function incrementSoldQtyIfAvailable(
  gatepassItemId: string,
  quantity: number,
): Promise<SelectGatepassItem | undefined> {
  const [updatedItem] = await db
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
): Promise<SelectGatepassItem | undefined> {
  const [updatedItem] = await db
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
): Promise<SelectGatepassItem | undefined> {
  const [updatedItem] = await db
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
): Promise<SubmitHandoverOutcome> {
  return db.transaction(async (tx) => {
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
      gatepass: { gatepass: updatedGatepass, items: settledItems },
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
): Promise<SelectGatepass | undefined> {
  const [updatedGatepass] = await db
    .update(gatepassesTable)
    .set(changes)
    .where(eq(gatepassesTable.id, gatepassId))
    .returning();
  return updatedGatepass;
}

export interface GatepassHistoryRow {
  gatepass: SelectGatepass;
  totalIssuedQty: number;
  totalSoldQty: number;
}

export async function getGatepassHistoryForSalesman(
  salesmanId: string,
): Promise<GatepassHistoryRow[]> {
  return db
    .select({
      gatepass: gatepassesTable,
      totalIssuedQty: sql<number>`coalesce(sum(${gatepassItemsTable.issuedQty}), 0)::int`,
      totalSoldQty: sql<number>`coalesce(sum(${gatepassItemsTable.soldQty}), 0)::int`,
    })
    .from(gatepassesTable)
    .leftJoin(gatepassItemsTable, eq(gatepassItemsTable.gatepassId, gatepassesTable.id))
    .where(eq(gatepassesTable.salesmanId, salesmanId))
    .groupBy(gatepassesTable.id)
    .orderBy(desc(gatepassesTable.businessDate));
}

export interface AllotmentMatrixRow {
  salesmanId: string;
  salesmanCode: string;
  varietyId: string;
  productName: string;
  varietyName: string;
  issuedQty: number;
  soldQty: number;
  availableQty: number | null;
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
      varietyId: gatepassItemsTable.varietyId,
      productName: productsTable.name,
      varietyName: productVarietiesTable.name,
      issuedQty: gatepassItemsTable.issuedQty,
      soldQty: gatepassItemsTable.soldQty,
      availableQty: gatepassItemsTable.availableQty,
      returnedQty: gatepassItemsTable.returnedQty,
      shortReason: gatepassItemsTable.shortReason,
      shortNote: gatepassItemsTable.shortNote,
    })
    .from(gatepassItemsTable)
    .innerJoin(gatepassesTable, eq(gatepassItemsTable.gatepassId, gatepassesTable.id))
    .innerJoin(salesmenTable, eq(gatepassesTable.salesmanId, salesmenTable.id))
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
      and(
        eq(gatepassesTable.businessDate, businessDate),
        eq(gatepassesTable.hasDiscrepancy, true),
      ),
    )
    .orderBy(desc(gatepassesTable.closedAt));
}
