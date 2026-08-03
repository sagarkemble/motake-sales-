import { and, asc, count, desc, eq, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  gatepassItemsTable,
  gatepassesTable,
  productVarietiesTable,
  productsTable,
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
  const [gatepass] = await db.select().from(gatepassesTable).where(eq(gatepassesTable.id, gatepassId));
  return gatepass;
}

export async function getGatepassBySalesmanAndDate(
  salesmanId: string,
  businessDate: string,
): Promise<SelectGatepass | undefined> {
  const [gatepass] = await db
    .select()
    .from(gatepassesTable)
    .where(and(eq(gatepassesTable.salesmanId, salesmanId), eq(gatepassesTable.businessDate, businessDate)));
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
      and(eq(gatepassItemsTable.gatepassId, gatepassId), eq(gatepassItemsTable.varietyId, varietyId)),
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
      and(eq(gatepassItemsTable.id, gatepassItemId), sql`${gatepassItemsTable.soldQty} >= ${quantity}`),
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

export async function updateGatepassStatus(
  gatepassId: string,
  changes: Partial<Pick<InsertGatepass, "status" | "closedBy" | "closedAt" | "hasDiscrepancy" | "notes">>,
): Promise<SelectGatepass | undefined> {
  const [updatedGatepass] = await db
    .update(gatepassesTable)
    .set(changes)
    .where(eq(gatepassesTable.id, gatepassId))
    .returning();
  return updatedGatepass;
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
}

export async function getAllotmentMatrixForDate(businessDate: string): Promise<AllotmentMatrixRow[]> {
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

export async function getEndOfDayTotalsForDate(businessDate: string): Promise<GatepassEndOfDayTotals> {
  const itemTotalsRows = await db
    .select({
      totalIssuedQty: sql<number>`coalesce(sum(${gatepassItemsTable.issuedQty}), 0)`,
      totalSoldQty: sql<number>`coalesce(sum(${gatepassItemsTable.soldQty}), 0)`,
      totalReturnedQty: sql<number>`coalesce(sum(${gatepassItemsTable.returnedQty}), 0)`,
    })
    .from(gatepassItemsTable)
    .innerJoin(gatepassesTable, eq(gatepassItemsTable.gatepassId, gatepassesTable.id))
    .where(eq(gatepassesTable.businessDate, businessDate));

  const discrepancyRows = await db
    .select({ discrepancyGatepassCount: count() })
    .from(gatepassesTable)
    .where(and(eq(gatepassesTable.businessDate, businessDate), eq(gatepassesTable.hasDiscrepancy, true)));

  const itemTotals = firstOrThrow(itemTotalsRows, "getEndOfDayTotalsForDate item totals");
  const { discrepancyGatepassCount } = firstOrThrow(discrepancyRows, "getEndOfDayTotalsForDate discrepancy count");

  return { ...itemTotals, discrepancyGatepassCount };
}
