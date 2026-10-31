import { count, desc, eq, sql, type SQL } from "drizzle-orm";

import { db } from "../../index";
import {
  billsTable,
  gstr1FilingsTable,
  profilesTable,
  type InsertGstr1Filing,
  type SelectBill,
  type SelectGstr1Filing,
} from "../../schema";
import { billIsCancelled } from "../bills/cancelled";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

// GSTR-1 filings and the derived month lock (Spec I, #43). Nothing is stamped on a Bill: Filed
// month comes from gstr1_filings + bills.bill_date.

// First key of the two-key advisory lock; the second is the month as YYYYMM.
const FILING_MONTH_LOCK_NAMESPACE = 4_301_043;

// --- Month lock.

// Record filing takes the exclusive form; Correct and Cancel take the shared form for their Bill's
// month, so a Bill change either commits before the filing or sees it.
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

export function billInFiledMonth(): SQL {
  return sql`EXISTS (
    SELECT 1 FROM "gstr1_filings"
    WHERE "gstr1_filings"."period_month" = date_trunc('month', "bills"."bill_date")::date
  )`;
}

export type BillGstFacts = Pick<SelectBill, "id" | "number" | "billDate"> & {
  cancelled: boolean;
  filedMonth: boolean;
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
      cancelled: sql<boolean>`${billIsCancelled()}`,
      filedMonth: sql<boolean>`${billInFiledMonth()}`,
    })
    .from(billsTable)
    .where(eq(billsTable.id, billId));
  return row;
}

// Bills dated in the month.
export async function countBillsInMonth(
  periodMonth: string,
  executor: DbExecutor = db,
): Promise<{ billsDatedInMonth: number }> {
  const [row] = await executor
    .select({ billsDatedInMonth: count() })
    .from(billsTable)
    .where(sql`date_trunc('month', ${billsTable.billDate})::date = ${periodMonth}::date`);
  return { billsDatedInMonth: row?.billsDatedInMonth ?? 0 };
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
