import { and, asc, count, desc, eq, gte, ilike, lte, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  billItemsTable,
  billsTable,
  customersTable,
  ordersTable,
  type SelectBill,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import {
  buildPaginationOffsets,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../shared/pagination";
import { billIsNotCancelled } from "./cancelled";

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

const billCancelled = sql<boolean>`NOT ${billIsNotCancelled()}`;

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
