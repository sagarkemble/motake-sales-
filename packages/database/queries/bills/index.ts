import { and, asc, count, desc, eq, gte, ilike, inArray, lte, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  billItemsTable,
  billsTable,
  billVersionsTable,
  customersTable,
  ordersTable,
  profilesTable,
  type InsertBill,
  type InsertBillItem,
  type InsertBillVersion,
  type SelectBill,
  type SelectBillItem,
  type SelectBillVersion,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";
import {
  buildPaginationOffsets,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../shared/pagination";
import { billIsCancelled, billIsNotCancelled } from "./cancelled";

export interface BillLineStamp {
  name: string;
  unit: string;
  hsn: string;
}

// Frozen at issue; read as stored.
export interface BillLetterhead {
  route: { name: string; code: string; delivery_state: string };
  buyer: { shop_name: string; phone: string; address: string; gstin: string | null };
  seller: { legal_name: string; address: string; gstin: string };
}

export interface BillLine {
  id: string;
  varietyId: string;
  orderItemId: string | null;
  stamp: BillLineStamp;
  quantity: number;
  routePricePaise: number;
  exempt: boolean;
  gstRateBps: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface BillDetail extends Omit<SelectBill, "letterhead" | "createdAt" | "updatedAt"> {
  letterhead: BillLetterhead;
  // Resolved through the Ledger Bill debit; null only for a ₹0 Bill with no order.
  customerId: string | null;
  cancelled: boolean;
  items: BillLine[];
}

// A Bill has no customer_id: the Ledger Bill debit names the Customer for order and office
// Bills alike. The order is the fallback for a ₹0 Bill, which posts no debit.
export const billCustomerId = sql<string | null>`coalesce(
  (SELECT "ledger_entries"."customer_id" FROM "ledger_entries"
   WHERE "ledger_entries"."bill_id" = "bills"."id" AND "ledger_entries"."entry_type" = 'bill'),
  (SELECT "orders"."customer_id" FROM "orders" WHERE "orders"."id" = "bills"."order_id")
)`;

const billCancelled = sql<boolean>`${billIsCancelled()}`;

async function getBillDetailWhere(
  condition: ReturnType<typeof eq>,
): Promise<BillDetail | undefined> {
  const [headerRow] = await db
    .select({ bill: billsTable, customerId: billCustomerId, cancelled: billCancelled })
    .from(billsTable)
    .where(condition);
  if (!headerRow) return undefined;

  const itemRows = await db
    .select({
      id: billItemsTable.id,
      varietyId: billItemsTable.varietyId,
      orderItemId: billItemsTable.orderItemId,
      stamp: billItemsTable.stamp,
      quantity: billItemsTable.quantity,
      routePricePaise: billItemsTable.routePricePaise,
      exempt: billItemsTable.exempt,
      gstRateBps: billItemsTable.gstRateBps,
      taxablePaise: billItemsTable.taxablePaise,
      cgstPaise: billItemsTable.cgstPaise,
      sgstPaise: billItemsTable.sgstPaise,
      igstPaise: billItemsTable.igstPaise,
    })
    .from(billItemsTable)
    .where(eq(billItemsTable.billId, headerRow.bill.id))
    .orderBy(asc(billItemsTable.createdAt), asc(billItemsTable.id));

  const { createdAt: _createdAt, updatedAt: _updatedAt, ...bill } = headerRow.bill;
  return {
    ...bill,
    letterhead: bill.letterhead as BillLetterhead,
    customerId: headerRow.customerId,
    cancelled: headerRow.cancelled,
    items: itemRows.map((itemRow) => ({ ...itemRow, stamp: itemRow.stamp as BillLineStamp })),
  };
}

export async function getBillDetailById(billId: string): Promise<BillDetail | undefined> {
  return getBillDetailWhere(eq(billsTable.id, billId));
}

export async function getBillDetailByNumber(number: string): Promise<BillDetail | undefined> {
  return getBillDetailWhere(eq(billsTable.number, number));
}

export async function getBillDetailByOrderId(orderId: string): Promise<BillDetail | undefined> {
  return getBillDetailWhere(eq(billsTable.orderId, orderId));
}

export interface BillListFilters {
  customerId?: string;
  salesmanId?: string;
  billDateFrom?: string;
  billDateTo?: string;
  numberSearch?: string;
  hideCancelled?: boolean;
}

export interface BillListRow {
  id: string;
  orderId: string | null;
  number: string;
  legalType: SelectBill["legalType"];
  billDate: string;
  totalQuantity: number;
  totalPaise: number;
  customerId: string | null;
  customerShopName: string | null;
  cancelled: boolean;
}

export async function listBills(
  filters: BillListFilters,
  pagination: PaginationParams,
): Promise<PaginatedResult<BillListRow>> {
  const { limit, offset } = buildPaginationOffsets(pagination);
  const whereClause = and(
    filters.customerId ? sql`${billCustomerId} = ${filters.customerId}` : undefined,
    filters.salesmanId ? eq(ordersTable.salesmanId, filters.salesmanId) : undefined,
    filters.billDateFrom ? gte(billsTable.billDate, filters.billDateFrom) : undefined,
    filters.billDateTo ? lte(billsTable.billDate, filters.billDateTo) : undefined,
    filters.numberSearch ? ilike(billsTable.number, `%${filters.numberSearch}%`) : undefined,
    filters.hideCancelled ? billIsNotCancelled() : undefined,
  );

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: billsTable.id,
        orderId: billsTable.orderId,
        number: billsTable.number,
        legalType: billsTable.legalType,
        billDate: billsTable.billDate,
        totalQuantity: billsTable.totalQuantity,
        totalPaise: billsTable.totalPaise,
        customerId: billCustomerId,
        customerShopName: sql<string | null>`(
          SELECT ${customersTable.shopName} FROM ${customersTable}
          WHERE ${customersTable.id} = ${billCustomerId}
        )`,
        cancelled: billCancelled,
      })
      .from(billsTable)
      .leftJoin(ordersTable, eq(billsTable.orderId, ordersTable.id))
      .where(whereClause)
      .orderBy(desc(billsTable.billDate), desc(billsTable.number))
      .limit(limit)
      .offset(offset),
    db
      .select({ totalCount: count() })
      .from(billsTable)
      .leftJoin(ordersTable, eq(billsTable.orderId, ordersTable.id))
      .where(whereClause),
  ]);

  const { totalCount } = firstOrThrow(countRows, "listBills count");
  return toPaginatedResult(rows, totalCount, pagination);
}

// --- Bill issue (Spec F): the paper, its lines and bill_versions v1.

// The Bill a Raise Bill attempt with this key already wrote (db-decisions/0015).
export async function getBillByIdempotencyKey(
  idempotencyKey: string,
  executor: DbExecutor = db,
): Promise<SelectBill | undefined> {
  const [bill] = await executor
    .select()
    .from(billsTable)
    .where(eq(billsTable.idempotencyKey, idempotencyKey));
  return bill;
}

export async function insertBill(
  newBill: InsertBill,
  executor: DbExecutor = db,
): Promise<SelectBill> {
  const insertedRows = await executor.insert(billsTable).values(newBill).returning();
  return firstOrThrow(insertedRows, "insertBill");
}

export async function insertBillItems(
  newItems: InsertBillItem[],
  executor: DbExecutor = db,
): Promise<SelectBillItem[]> {
  return executor.insert(billItemsTable).values(newItems).returning();
}

export async function insertBillVersion(
  newVersion: InsertBillVersion,
  executor: DbExecutor = db,
): Promise<SelectBillVersion> {
  const insertedRows = await executor.insert(billVersionsTable).values(newVersion).returning();
  return firstOrThrow(insertedRows, "insertBillVersion");
}

export async function getBillByOrderId(
  orderId: string,
  executor: DbExecutor = db,
): Promise<SelectBill | undefined> {
  const [bill] = await executor.select().from(billsTable).where(eq(billsTable.orderId, orderId));
  return bill;
}

// --- Admin Bill paper (Spec G): lock, Correct's live rewrite and Bill history reads.

export async function lockBillRow(
  billId: string,
  executor: DbExecutor = db,
): Promise<SelectBill | undefined> {
  const [bill] = await executor
    .select()
    .from(billsTable)
    .where(eq(billsTable.id, billId))
    .for("update");
  return bill;
}

export async function getBillById(
  billId: string,
  executor: DbExecutor = db,
): Promise<SelectBill | undefined> {
  const [bill] = await executor.select().from(billsTable).where(eq(billsTable.id, billId));
  return bill;
}

// The Customer on the Bill's Ledger Bill debit (the order's Customer for an order-backed Bill; an
// office Bill has no other link).
export async function getBillCustomerId(
  billId: string,
  executor: DbExecutor = db,
): Promise<string | null> {
  const [row] = await executor
    .select({ customerId: billCustomerId })
    .from(billsTable)
    .where(eq(billsTable.id, billId));
  return row?.customerId ?? null;
}

export async function listBillItemsByBillId(
  billId: string,
  executor: DbExecutor = db,
): Promise<SelectBillItem[]> {
  return executor
    .select()
    .from(billItemsTable)
    .where(eq(billItemsTable.billId, billId))
    .orderBy(asc(billItemsTable.createdAt), asc(billItemsTable.id));
}

export async function updateBill(
  billId: string,
  changes: Partial<
    Pick<
      InsertBill,
      | "legalType"
      | "letterhead"
      | "totalQuantity"
      | "totalPaise"
      | "taxablePaise"
      | "cgstPaise"
      | "sgstPaise"
      | "igstPaise"
      | "roundOffPaise"
    >
  >,
  executor: DbExecutor = db,
): Promise<SelectBill> {
  const updatedRows = await executor
    .update(billsTable)
    .set(changes)
    .where(eq(billsTable.id, billId))
    .returning();
  return firstOrThrow(updatedRows, "updateBill");
}

// Correct keeps a surviving line's id, so one line has one id in every version.
export async function updateBillItem(
  billItemId: string,
  changes: Pick<
    InsertBillItem,
    "quantity" | "taxablePaise" | "cgstPaise" | "sgstPaise" | "igstPaise"
  >,
  executor: DbExecutor = db,
): Promise<SelectBillItem> {
  const updatedRows = await executor
    .update(billItemsTable)
    .set(changes)
    .where(eq(billItemsTable.id, billItemId))
    .returning();
  return firstOrThrow(updatedRows, "updateBillItem");
}

export async function deleteBillItems(
  billItemIds: string[],
  executor: DbExecutor = db,
): Promise<void> {
  if (billItemIds.length === 0) return;
  await executor.delete(billItemsTable).where(inArray(billItemsTable.id, billItemIds));
}

export async function getLatestBillVersion(
  billId: string,
  executor: DbExecutor = db,
): Promise<SelectBillVersion | undefined> {
  const [version] = await executor
    .select()
    .from(billVersionsTable)
    .where(eq(billVersionsTable.billId, billId))
    .orderBy(desc(billVersionsTable.versionNumber))
    .limit(1);
  return version;
}

export async function getBillVersionByNumber(
  billId: string,
  versionNumber: number,
  executor: DbExecutor = db,
): Promise<SelectBillVersion | undefined> {
  const [version] = await executor
    .select()
    .from(billVersionsTable)
    .where(
      and(eq(billVersionsTable.billId, billId), eq(billVersionsTable.versionNumber, versionNumber)),
    );
  return version;
}

// For each line id, the newest version of this Bill whose items snapshot still has that line. A
// Note line must point at a version that contains it (db-decisions/0006); a line Correct removed
// lives on only in older versions.
export async function findNewestVersionIdsForLines(
  billId: string,
  lineIds: string[],
  executor: DbExecutor = db,
): Promise<Map<string, string>> {
  if (lineIds.length === 0) return new Map();
  const versions = await executor
    .select({ id: billVersionsTable.id, items: billVersionsTable.items })
    .from(billVersionsTable)
    .where(eq(billVersionsTable.billId, billId))
    .orderBy(desc(billVersionsTable.versionNumber));
  const newest = new Map<string, string>();
  for (const lineId of lineIds) {
    const version = versions.find((candidate) =>
      (candidate.items as Array<{ id: string }>).some((item) => item.id === lineId),
    );
    if (version) newest.set(lineId, version.id);
  }
  return newest;
}
