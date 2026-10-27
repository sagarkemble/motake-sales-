import { and, asc, count, desc, eq, ne, sql, type SQL } from "drizzle-orm";

import { db } from "../../index";
import {
  billsTable,
  gstr1FilingsTable,
  profilesTable,
  type InsertBill,
  type InsertGstr1Filing,
  type SelectBill,
  type SelectGstr1Filing,
} from "../../schema";
import { billCustomerId, type BillLetterhead } from "../bills";
import { billIsCancelled, billIsNotCancelled } from "../bills/cancelled";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";
import {
  buildPaginationOffsets,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../shared/pagination";

// GSTR-1 filings, the derived month lock and IRN pending (Spec I, #43). Nothing is stamped on a
// Bill: Filed month comes from gstr1_filings + bills.bill_date, IRN pending from the live flags.

// First key of the two-key advisory lock; the second is the month as YYYYMM.
const FILING_MONTH_LOCK_NAMESPACE = 4_301_043;

// --- Month lock.

// Record filing takes the exclusive form; Correct, Cancel and portal cancellation take the shared
// form for their Bill's month, so a Bill change either commits before the filing or sees it.
export async function lockFilingMonth(
  periodMonth: string,
  mode: "exclusive" | "shared",
  executor: DbExecutor = db,
): Promise<void> {
  const monthKey = Number(periodMonth.slice(0, 4) + periodMonth.slice(5, 7));
  if (mode === "exclusive") {
    await executor.execute(
      sql`SELECT pg_advisory_xact_lock(${FILING_MONTH_LOCK_NAMESPACE}, ${monthKey})`,
    );
  } else {
    await executor.execute(
      sql`SELECT pg_advisory_xact_lock_shared(${FILING_MONTH_LOCK_NAMESPACE}, ${monthKey})`,
    );
  }
}

// --- The one IRN pending rule, over a `bills` row (used unaliased).

// The seller flag defaults to on while the Seller master is not set up.
const sellerEinvoicingRequired = sql<boolean>`coalesce(
  (SELECT bool_and("seller_settings"."einvoicing_required") FROM "seller_settings"),
  true
)`;

// The Bill's Customer (Ledger debit Customer), read live: flipping it moves old Bills.
const customerEinvoicingRequired = sql<boolean>`coalesce(
  (SELECT "customers"."einvoicing_required" FROM "customers" WHERE "customers"."id" = ${billCustomerId}),
  false
)`;

export function billEinvoicingApplies(): SQL {
  return sql`("bills"."legal_type" = 'tax_invoice' AND ${sellerEinvoicingRequired} AND ${customerEinvoicingRequired})`;
}

export function billIrnPending(): SQL {
  return sql`(${billEinvoicingApplies()} AND "bills"."irn" IS NULL AND ${billIsNotCancelled()})`;
}

export function billInFiledMonth(): SQL {
  return sql`EXISTS (
    SELECT 1 FROM "gstr1_filings"
    WHERE "gstr1_filings"."period_month" = date_trunc('month', "bills"."bill_date")::date
  )`;
}

export type BillGstFacts = Pick<
  SelectBill,
  | "id"
  | "number"
  | "billDate"
  | "legalType"
  | "irn"
  | "irnAckNumber"
  | "irnAckDate"
  | "signedQrText"
  | "signedQrImageKey"
  | "irnRecordedAt"
  | "irnRecordedBy"
  | "irnCorrectReason"
  | "portalCancelAckNumber"
  | "portalCancelAckDate"
  | "portalCancelNotes"
> & {
  customerId: string | null;
  irnRecordedByName: string | null;
  cancelled: boolean;
  filedMonth: boolean;
  einvoicingApplies: boolean;
  irnPending: boolean;
};

// Everything the GST gates decide on for one Bill, read in the caller's transaction.
export async function getBillGstFacts(
  billId: string,
  executor: DbExecutor = db,
): Promise<BillGstFacts | undefined> {
  const [row] = await executor
    .select({
      id: billsTable.id,
      number: billsTable.number,
      billDate: billsTable.billDate,
      legalType: billsTable.legalType,
      irn: billsTable.irn,
      irnAckNumber: billsTable.irnAckNumber,
      irnAckDate: billsTable.irnAckDate,
      signedQrText: billsTable.signedQrText,
      signedQrImageKey: billsTable.signedQrImageKey,
      irnRecordedAt: billsTable.irnRecordedAt,
      irnRecordedBy: billsTable.irnRecordedBy,
      irnCorrectReason: billsTable.irnCorrectReason,
      portalCancelAckNumber: billsTable.portalCancelAckNumber,
      portalCancelAckDate: billsTable.portalCancelAckDate,
      portalCancelNotes: billsTable.portalCancelNotes,
      customerId: billCustomerId,
      irnRecordedByName: profilesTable.name,
      cancelled: sql<boolean>`${billIsCancelled()}`,
      filedMonth: sql<boolean>`${billInFiledMonth()}`,
      einvoicingApplies: sql<boolean>`${billEinvoicingApplies()}`,
      irnPending: sql<boolean>`${billIrnPending()}`,
    })
    .from(billsTable)
    .leftJoin(profilesTable, eq(billsTable.irnRecordedBy, profilesTable.id))
    .where(eq(billsTable.id, billId));
  return row;
}

export interface IrnPendingRow {
  billId: string;
  number: string;
  customerId: string | null;
  customerShopName: string | null;
  routeName: string;
  routeCode: string;
  billDate: string;
  totalPaise: number;
  filedMonth: boolean;
}

// Oldest first: Bill date, then number.
export async function listIrnPendingBills(
  pagination: PaginationParams,
): Promise<PaginatedResult<IrnPendingRow>> {
  const { limit, offset } = buildPaginationOffsets(pagination);
  const [rows, totalCount] = await Promise.all([
    db
      .select({
        billId: billsTable.id,
        number: billsTable.number,
        customerId: billCustomerId,
        customerShopName: sql<string | null>`(
          SELECT "customers"."shop_name" FROM "customers" WHERE "customers"."id" = ${billCustomerId}
        )`,
        letterhead: billsTable.letterhead,
        billDate: billsTable.billDate,
        totalPaise: billsTable.totalPaise,
        filedMonth: sql<boolean>`${billInFiledMonth()}`,
      })
      .from(billsTable)
      .where(billIrnPending())
      .orderBy(asc(billsTable.billDate), asc(billsTable.number))
      .limit(limit)
      .offset(offset),
    countIrnPendingBills(),
  ]);
  return toPaginatedResult(
    rows.map(({ letterhead, ...row }) => {
      const { route } = letterhead as BillLetterhead;
      return { ...row, routeName: route.name, routeCode: route.code };
    }),
    totalCount,
    pagination,
  );
}

export async function countIrnPendingBills(executor: DbExecutor = db): Promise<number> {
  const [row] = await executor.select({ total: count() }).from(billsTable).where(billIrnPending());
  return row?.total ?? 0;
}

// Bills dated in the month and how many of them are IRN pending.
export async function countBillsInMonth(
  periodMonth: string,
  executor: DbExecutor = db,
): Promise<{ billsDatedInMonth: number; irnPendingInMonth: number }> {
  const [row] = await executor
    .select({
      billsDatedInMonth: count(),
      irnPendingInMonth: sql<number>`count(*) FILTER (WHERE ${billIrnPending()})::int`,
    })
    .from(billsTable)
    .where(sql`date_trunc('month', ${billsTable.billDate})::date = ${periodMonth}::date`);
  return {
    billsDatedInMonth: row?.billsDatedInMonth ?? 0,
    irnPendingInMonth: row?.irnPendingInMonth ?? 0,
  };
}

// --- GSTR-1 filings.

export async function getGstr1FilingByMonth(
  periodMonth: string,
  executor: DbExecutor = db,
): Promise<SelectGstr1Filing | undefined> {
  const [filing] = await executor
    .select()
    .from(gstr1FilingsTable)
    .where(eq(gstr1FilingsTable.periodMonth, periodMonth));
  return filing;
}

export async function lockGstr1FilingRow(
  filingId: string,
  executor: DbExecutor = db,
): Promise<SelectGstr1Filing | undefined> {
  const [filing] = await executor
    .select()
    .from(gstr1FilingsTable)
    .where(eq(gstr1FilingsTable.id, filingId))
    .for("update");
  return filing;
}

export async function insertGstr1Filing(
  newFiling: InsertGstr1Filing,
  executor: DbExecutor = db,
): Promise<SelectGstr1Filing> {
  const insertedRows = await executor.insert(gstr1FilingsTable).values(newFiling).returning();
  return firstOrThrow(insertedRows, "insertGstr1Filing");
}

// Correct filing: never the month or the filer.
export async function updateGstr1Filing(
  filingId: string,
  changes: Pick<InsertGstr1Filing, "filedOn" | "reference" | "notes">,
  executor: DbExecutor = db,
): Promise<SelectGstr1Filing> {
  const updatedRows = await executor
    .update(gstr1FilingsTable)
    .set(changes)
    .where(eq(gstr1FilingsTable.id, filingId))
    .returning();
  return firstOrThrow(updatedRows, "updateGstr1Filing");
}

export interface Gstr1FilingRow extends SelectGstr1Filing {
  filerName: string | null;
}

// Newest month first.
export async function listGstr1Filings(executor: DbExecutor = db): Promise<Gstr1FilingRow[]> {
  const rows = await executor
    .select({ filing: gstr1FilingsTable, filerName: profilesTable.name })
    .from(gstr1FilingsTable)
    .leftJoin(profilesTable, eq(gstr1FilingsTable.filerId, profilesTable.id))
    .orderBy(desc(gstr1FilingsTable.periodMonth));
  return rows.map((row) => ({ ...row.filing, filerName: row.filerName }));
}

// --- IRN and portal cancellation writes on the bills row.

// Another Bill already holding this IRN.
export async function getOtherBillByIrn(
  irn: string,
  billId: string,
  executor: DbExecutor = db,
): Promise<Pick<SelectBill, "id" | "number"> | undefined> {
  const [bill] = await executor
    .select({ id: billsTable.id, number: billsTable.number })
    .from(billsTable)
    .where(and(eq(billsTable.irn, irn), ne(billsTable.id, billId)));
  return bill;
}

export async function setBillIrn(
  billId: string,
  changes: Pick<
    InsertBill,
    | "irn"
    | "irnAckNumber"
    | "irnAckDate"
    | "signedQrText"
    | "signedQrImageKey"
    | "irnRecordedAt"
    | "irnRecordedBy"
    | "irnCorrectReason"
  >,
  executor: DbExecutor = db,
): Promise<SelectBill> {
  const updatedRows = await executor
    .update(billsTable)
    .set(changes)
    .where(eq(billsTable.id, billId))
    .returning();
  return firstOrThrow(updatedRows, "setBillIrn");
}

export async function setBillPortalCancelAck(
  billId: string,
  changes: Pick<InsertBill, "portalCancelAckNumber" | "portalCancelAckDate" | "portalCancelNotes">,
  executor: DbExecutor = db,
): Promise<SelectBill> {
  const updatedRows = await executor
    .update(billsTable)
    .set(changes)
    .where(eq(billsTable.id, billId))
    .returning();
  return firstOrThrow(updatedRows, "setBillPortalCancelAck");
}
