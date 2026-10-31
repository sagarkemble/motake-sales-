import { and, asc, count, eq, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "../../index";
import {
  billsTable,
  customersTable,
  ledgerEntriesTable,
  noteLinesTable,
  notesTable,
  ordersTable,
  paymentsTable,
  profilesTable,
  refundsTable,
  type InsertLedgerEntry,
  type InsertNote,
  type InsertNoteLine,
  type SelectLedgerEntry,
  type SelectNote,
  type SelectNoteLine,
} from "../../schema";
import { billIsCancelled } from "../bills/cancelled";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";
import {
  buildPaginationOffsets,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../shared/pagination";

// Adds `deltaPaise` to a live Customer's stored Balance. The UPDATE takes the Customer row lock.
// Returns the Balance after, or undefined when the Customer is missing or soft-deleted.
export async function applyBalanceChange(
  input: { customerId: string; deltaPaise: number },
  executor: DbExecutor = db,
): Promise<number | undefined> {
  const [row] = await executor
    .update(customersTable)
    .set({ balancePaise: sql`${customersTable.balancePaise} + ${input.deltaPaise}` })
    .where(and(eq(customersTable.id, input.customerId), isNull(customersTable.deletedAt)))
    .returning({ balancePaise: customersTable.balancePaise });
  return row?.balancePaise;
}

// A read: a deactivated (soft-deleted) Customer's Balance stays readable.
export async function getStoredBalance(
  customerId: string,
  executor: DbExecutor = db,
): Promise<number | undefined> {
  const [row] = await executor
    .select({ balancePaise: customersTable.balancePaise })
    .from(customersTable)
    .where(eq(customersTable.id, customerId));
  return row?.balancePaise;
}

export async function insertLedgerEntry(
  values: InsertLedgerEntry,
  executor: DbExecutor = db,
): Promise<SelectLedgerEntry> {
  const [row] = await executor.insert(ledgerEntriesTable).values(values).returning();
  return row!;
}

export async function hasOpeningBalance(
  customerId: string,
  executor: DbExecutor = db,
): Promise<boolean> {
  const [row] = await executor
    .select({ id: ledgerEntriesTable.id })
    .from(ledgerEntriesTable)
    .where(
      and(
        eq(ledgerEntriesTable.customerId, customerId),
        eq(ledgerEntriesTable.entryType, "opening_balance"),
      ),
    );
  return Boolean(row);
}

// The Customer's one Opening balance row with who set it (Spec H's Opening paper).
export async function getOpeningBalanceEntry(customerId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select({ entry: ledgerEntriesTable, actorName: profilesTable.name })
    .from(ledgerEntriesTable)
    .leftJoin(profilesTable, eq(ledgerEntriesTable.actorId, profilesTable.id))
    .where(
      and(
        eq(ledgerEntriesTable.customerId, customerId),
        eq(ledgerEntriesTable.entryType, "opening_balance"),
      ),
    );
  return row;
}

// --- The papers a Ledger row reads its amount and Customer from.

export async function findBillForPosting(billId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select({
      id: billsTable.id,
      totalPaise: billsTable.totalPaise,
      orderCustomerId: ordersTable.customerId,
    })
    .from(billsTable)
    .leftJoin(ordersTable, eq(billsTable.orderId, ordersTable.id))
    .where(eq(billsTable.id, billId));
  return row;
}

// The Customer an office Bill (no order) was debited to: its only relational link.
export async function findBillDebit(billId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select({ id: ledgerEntriesTable.id, customerId: ledgerEntriesTable.customerId })
    .from(ledgerEntriesTable)
    .where(and(eq(ledgerEntriesTable.billId, billId), eq(ledgerEntriesTable.entryType, "bill")));
  return row;
}

export async function findPaymentForPosting(paymentId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select({
      id: paymentsTable.id,
      customerId: paymentsTable.customerId,
      amountKeptPaise: paymentsTable.amountKeptPaise,
    })
    .from(paymentsTable)
    .where(eq(paymentsTable.id, paymentId));
  return row;
}

export async function findRefundForPosting(refundId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select({
      id: refundsTable.id,
      customerId: refundsTable.customerId,
      amountPaise: refundsTable.amountPaise,
      reason: refundsTable.reason,
    })
    .from(refundsTable)
    .where(eq(refundsTable.id, refundId));
  return row;
}

export async function findNoteForPosting(noteId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select({
      id: notesTable.id,
      kind: notesTable.kind,
      billId: notesTable.billId,
      amountPaise: notesTable.amountPaise,
      reason: notesTable.reason,
      ledgerEntryId: notesTable.ledgerEntryId,
    })
    .from(notesTable)
    .where(eq(notesTable.id, noteId));
  return row;
}

// The one Ledger row a Payment or Refund is first posted as (adjustments are separate rows).
export async function findFirstPosting(
  link: { paymentId: string } | { refundId: string },
  executor: DbExecutor = db,
) {
  const where =
    "paymentId" in link
      ? and(
          eq(ledgerEntriesTable.paymentId, link.paymentId),
          eq(ledgerEntriesTable.entryType, "payment"),
        )
      : and(
          eq(ledgerEntriesTable.refundId, link.refundId),
          eq(ledgerEntriesTable.entryType, "refund"),
        );
  const [row] = await executor
    .select({ id: ledgerEntriesTable.id })
    .from(ledgerEntriesTable)
    .where(where);
  return row;
}

export async function findLedgerEntryForNote(noteId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select({ id: ledgerEntriesTable.id })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.noteId, noteId));
  return row;
}

// The Balance as the Ledger reads it up to and including a Bill's debit (every row of that Customer
// whose posting time is not after it), for showing a retried checkout its first result.
export async function getBalanceThroughBillDebit(
  billId: string,
  executor: DbExecutor = db,
): Promise<number | undefined> {
  const billDebit = alias(ledgerEntriesTable, "bill_debit");
  const [row] = await executor
    .select({
      balancePaise: sql<string>`coalesce(sum(CASE WHEN ${ledgerEntriesTable.side} = 'debit' THEN ${ledgerEntriesTable.amountPaise} ELSE -${ledgerEntriesTable.amountPaise} END), 0)`,
    })
    .from(billDebit)
    .innerJoin(
      ledgerEntriesTable,
      and(
        eq(ledgerEntriesTable.customerId, billDebit.customerId),
        lte(ledgerEntriesTable.occurredAt, billDebit.occurredAt),
      ),
    )
    .where(and(eq(billDebit.billId, billId), eq(billDebit.entryType, "bill")))
    .groupBy(billDebit.id);
  return row ? Number(row.balancePaise) : undefined;
}

// --- Notes (Spec G): written in the caller's transaction with their one Ledger row (deferred FK
// pair, checked at commit).

// The Note a Raise Note attempt with this key already wrote (db-decisions/0015).
export async function getNoteByIdempotencyKey(
  idempotencyKey: string,
  executor: DbExecutor = db,
): Promise<SelectNote | undefined> {
  const [note] = await executor
    .select()
    .from(notesTable)
    .where(eq(notesTable.idempotencyKey, idempotencyKey));
  return note;
}

// The Balance as the Ledger reads it up to and including one row (every row of that Customer whose
// posting time is not after it), for showing a retried Raise Note its first result.
export async function getBalanceThroughLedgerEntry(
  ledgerEntryId: string,
  executor: DbExecutor = db,
): Promise<number | undefined> {
  const through = alias(ledgerEntriesTable, "through_entry");
  const [row] = await executor
    .select({
      balancePaise: sql<string>`coalesce(sum(CASE WHEN ${ledgerEntriesTable.side} = 'debit' THEN ${ledgerEntriesTable.amountPaise} ELSE -${ledgerEntriesTable.amountPaise} END), 0)`,
    })
    .from(through)
    .innerJoin(
      ledgerEntriesTable,
      and(
        eq(ledgerEntriesTable.customerId, through.customerId),
        lte(ledgerEntriesTable.occurredAt, through.occurredAt),
      ),
    )
    .where(eq(through.id, ledgerEntryId))
    .groupBy(through.id);
  return row ? Number(row.balancePaise) : undefined;
}

export async function insertNote(
  newNote: InsertNote,
  executor: DbExecutor = db,
): Promise<SelectNote> {
  const insertedRows = await executor.insert(notesTable).values(newNote).returning();
  return firstOrThrow(insertedRows, "insertNote");
}

export async function insertNoteLines(
  newLines: InsertNoteLine[],
  executor: DbExecutor = db,
): Promise<SelectNoteLine[]> {
  if (newLines.length === 0) return [];
  return executor.insert(noteLinesTable).values(newLines).returning();
}

// A Bill's Notes in the order they were raised.
export async function listNotesForBill(
  billId: string,
  executor: DbExecutor = db,
): Promise<SelectNote[]> {
  return executor
    .select()
    .from(notesTable)
    .where(eq(notesTable.billId, billId))
    .orderBy(asc(notesTable.createdAt), asc(notesTable.number));
}

// The Bill a Note was raised on.
export async function getNoteBillId(
  noteId: string,
  executor: DbExecutor = db,
): Promise<string | null> {
  const [row] = await executor
    .select({ billId: notesTable.billId })
    .from(notesTable)
    .where(eq(notesTable.id, noteId));
  return row?.billId ?? null;
}

export async function listNoteLinesForNotes(
  noteIds: string[],
  executor: DbExecutor = db,
): Promise<SelectNoteLine[]> {
  if (noteIds.length === 0) return [];
  return executor
    .select()
    .from(noteLinesTable)
    .where(inArray(noteLinesTable.noteId, noteIds))
    .orderBy(asc(noteLinesTable.id));
}

// --- Admin Ledger table (Spec G).

// Ledger row types as the Admin filters them: a Note row is typed by its Note kind. Payment and
// Refund adjustments are not rows (see ledgerRowAmount).
export type LedgerRowType =
  | Exclude<
      SelectLedgerEntry["entryType"],
      "credit_note" | "debit_note" | "payment_adjusted" | "refund_adjusted"
    >
  | SelectNote["kind"];

const ledgerRowType = sql<LedgerRowType>`CASE
  WHEN ${ledgerEntriesTable.entryType} IN ('credit_note', 'debit_note') THEN ${notesTable.kind}::text
  ELSE ${ledgerEntriesTable.entryType}::text
END`;

const ledgerBusinessDate = sql`(${ledgerEntriesTable.occurredAt} AT TIME ZONE 'Asia/Kolkata')::date`;

// A Payment or Refund correction stays in that record's history, not in the table: its row shows
// the net amount (original ± every adjustment), so the rows still add up to the totals.
const adjustmentEntryTypes = ["payment_adjusted", "refund_adjusted"] as const;

const ledgerRowAmount = sql<number>`CASE
  WHEN ${ledgerEntriesTable.entryType} = 'payment' THEN (
    SELECT coalesce(sum(CASE WHEN adjusted.side = ${ledgerEntriesTable.side} THEN adjusted.amount_paise ELSE -adjusted.amount_paise END), 0)
    FROM ledger_entries AS adjusted
    WHERE adjusted.payment_id = ${ledgerEntriesTable.paymentId}
  )
  WHEN ${ledgerEntriesTable.entryType} = 'refund' THEN (
    SELECT coalesce(sum(CASE WHEN adjusted.side = ${ledgerEntriesTable.side} THEN adjusted.amount_paise ELSE -adjusted.amount_paise END), 0)
    FROM ledger_entries AS adjusted
    WHERE adjusted.refund_id = ${ledgerEntriesTable.refundId}
  )
  ELSE ${ledgerEntriesTable.amountPaise}
END`.mapWith(Number);

export interface LedgerRowFilters {
  customerId: string;
  types?: LedgerRowType[];
  side?: SelectLedgerEntry["side"];
  // Asia/Kolkata dates, inclusive.
  from?: string;
  to?: string;
}

export interface LedgerRowRecord {
  id: string;
  entryType: SelectLedgerEntry["entryType"];
  rowType: LedgerRowType;
  side: SelectLedgerEntry["side"];
  amountPaise: number;
  occurredAt: Date;
  reason: string | null;
  number: string | null;
  billId: string | null;
  billCancelled: boolean;
  noteId: string | null;
  noteBillId: string | null;
  paymentId: string | null;
  refundId: string | null;
}

// Opening balance first, then posting time, then insert time. Filters hide rows only. Payment and
// Refund adjustments are never rows of their own.
export async function listCustomerLedgerRows(
  filters: LedgerRowFilters,
  pagination: PaginationParams,
  executor: DbExecutor = db,
): Promise<PaginatedResult<LedgerRowRecord>> {
  const { limit, offset } = buildPaginationOffsets(pagination);
  const whereClause = and(
    eq(ledgerEntriesTable.customerId, filters.customerId),
    notInArray(ledgerEntriesTable.entryType, [...adjustmentEntryTypes]),
    filters.types && filters.types.length > 0
      ? sql`${ledgerRowType} IN (${sql.join(
          filters.types.map((type) => sql`${type}`),
          sql`, `,
        )})`
      : undefined,
    filters.side ? eq(ledgerEntriesTable.side, filters.side) : undefined,
    filters.from ? sql`${ledgerBusinessDate} >= ${filters.from}` : undefined,
    filters.to ? sql`${ledgerBusinessDate} <= ${filters.to}` : undefined,
  );
  const [rows, countRows] = await Promise.all([
    executor
      .select({
        id: ledgerEntriesTable.id,
        entryType: ledgerEntriesTable.entryType,
        rowType: ledgerRowType,
        side: ledgerEntriesTable.side,
        amountPaise: ledgerRowAmount,
        occurredAt: ledgerEntriesTable.occurredAt,
        reason: ledgerEntriesTable.reason,
        number: sql<
          string | null
        >`coalesce(${billsTable.number}, ${notesTable.number}, ${paymentsTable.number}, ${refundsTable.number})`,
        billId: ledgerEntriesTable.billId,
        billCancelled: sql<boolean>`${billIsCancelled()}`,
        noteId: ledgerEntriesTable.noteId,
        noteBillId: notesTable.billId,
        paymentId: ledgerEntriesTable.paymentId,
        refundId: ledgerEntriesTable.refundId,
      })
      .from(ledgerEntriesTable)
      .leftJoin(billsTable, eq(ledgerEntriesTable.billId, billsTable.id))
      .leftJoin(notesTable, eq(ledgerEntriesTable.noteId, notesTable.id))
      .leftJoin(paymentsTable, eq(ledgerEntriesTable.paymentId, paymentsTable.id))
      .leftJoin(refundsTable, eq(ledgerEntriesTable.refundId, refundsTable.id))
      .where(whereClause)
      .orderBy(
        sql`(${ledgerEntriesTable.entryType} = 'opening_balance') DESC`,
        asc(ledgerEntriesTable.occurredAt),
        asc(ledgerEntriesTable.createdAt),
        asc(ledgerEntriesTable.id),
      )
      .limit(limit)
      .offset(offset),
    executor
      .select({ totalCount: count() })
      .from(ledgerEntriesTable)
      .leftJoin(notesTable, eq(ledgerEntriesTable.noteId, notesTable.id))
      .where(whereClause),
  ]);

  const { totalCount } = firstOrThrow(countRows, "listCustomerLedgerRows count");
  return toPaginatedResult(rows, totalCount, pagination);
}

export interface LedgerTotals {
  openingDebitPaise: number;
  openingCreditPaise: number;
  currentDebitPaise: number;
  currentCreditPaise: number;
  hasOpeningBalance: boolean;
}

// Over every Ledger row of the Customer, ignoring filters and paging. An adjustment counts on its
// Payment's (Credit) or Refund's (Debit) side, signed, so the totals match the net rows.
export async function getCustomerLedgerTotals(
  customerId: string,
  executor: DbExecutor = db,
): Promise<LedgerTotals> {
  const sumWhere = (opening: boolean, side: SelectLedgerEntry["side"]) =>
    sql<string>`coalesce(sum(${ledgerEntriesTable.amountPaise}) FILTER (WHERE ${ledgerEntriesTable.entryType} ${opening ? sql`=` : sql`<>`} 'opening_balance' AND ${ledgerEntriesTable.entryType} NOT IN ('payment_adjusted', 'refund_adjusted') AND ${ledgerEntriesTable.side} = ${side}), 0)`;
  const adjustmentsOf = (
    entryType: (typeof adjustmentEntryTypes)[number],
    side: SelectLedgerEntry["side"],
  ) =>
    sql<string>`coalesce(sum(CASE WHEN ${ledgerEntriesTable.side} = ${side} THEN ${ledgerEntriesTable.amountPaise} ELSE -${ledgerEntriesTable.amountPaise} END) FILTER (WHERE ${ledgerEntriesTable.entryType} = ${entryType}), 0)`;
  const [row] = await executor
    .select({
      openingDebitPaise: sumWhere(true, "debit"),
      openingCreditPaise: sumWhere(true, "credit"),
      currentDebitPaise: sql<string>`${sumWhere(false, "debit")} + ${adjustmentsOf("refund_adjusted", "debit")}`,
      currentCreditPaise: sql<string>`${sumWhere(false, "credit")} + ${adjustmentsOf("payment_adjusted", "credit")}`,
      openingCount: sql<number>`count(*) FILTER (WHERE ${ledgerEntriesTable.entryType} = 'opening_balance')::int`,
    })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.customerId, customerId));
  return {
    openingDebitPaise: Number(row?.openingDebitPaise ?? 0),
    openingCreditPaise: Number(row?.openingCreditPaise ?? 0),
    currentDebitPaise: Number(row?.currentDebitPaise ?? 0),
    currentCreditPaise: Number(row?.currentCreditPaise ?? 0),
    hasOpeningBalance: (row?.openingCount ?? 0) > 0,
  };
}
