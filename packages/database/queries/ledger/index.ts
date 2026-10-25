import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  billsTable,
  customersTable,
  ledgerEntriesTable,
  notesTable,
  ordersTable,
  paymentsTable,
  refundsTable,
  type InsertLedgerEntry,
  type SelectLedgerEntry,
} from "../../schema";
import type { DbExecutor } from "../shared/executor";

// Debits minus Credits for one Customer, as SQL so it can be summed or compared in place.
const signedAmount = sql<number>`CASE WHEN ${ledgerEntriesTable.side} = 'debit'
  THEN ${ledgerEntriesTable.amountPaise} ELSE -${ledgerEntriesTable.amountPaise} END`;

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

export async function lockLiveCustomerBalance(
  customerId: string,
  executor: DbExecutor = db,
): Promise<number | undefined> {
  const [row] = await executor
    .select({ balancePaise: customersTable.balancePaise })
    .from(customersTable)
    .where(and(eq(customersTable.id, customerId), isNull(customersTable.deletedAt)))
    .for("update");
  return row?.balancePaise;
}

export async function getStoredBalance(
  customerId: string,
  executor: DbExecutor = db,
): Promise<number | undefined> {
  const [row] = await executor
    .select({ balancePaise: customersTable.balancePaise })
    .from(customersTable)
    .where(and(eq(customersTable.id, customerId), isNull(customersTable.deletedAt)));
  return row?.balancePaise;
}

export async function setStoredBalance(
  input: { customerId: string; balancePaise: number },
  executor: DbExecutor = db,
): Promise<void> {
  await executor
    .update(customersTable)
    .set({ balancePaise: input.balancePaise })
    .where(eq(customersTable.id, input.customerId));
}

export async function insertLedgerEntry(
  values: InsertLedgerEntry,
  executor: DbExecutor = db,
): Promise<SelectLedgerEntry> {
  const [row] = await executor.insert(ledgerEntriesTable).values(values).returning();
  return row!;
}

export async function sumLedgerForCustomer(
  customerId: string,
  executor: DbExecutor = db,
): Promise<number> {
  const [row] = await executor
    .select({ total: sql<string | null>`SUM(${signedAmount})` })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.customerId, customerId));
  return Number(row?.total ?? 0);
}

export interface BalanceMismatch {
  customerId: string;
  storedPaise: number;
  ledgerPaise: number;
}

// Every live Customer whose stored Balance differs from its Ledger sum, including Customers with no
// Ledger rows and a non-zero stored Balance.
export async function listBalanceMismatches(executor: DbExecutor = db): Promise<BalanceMismatch[]> {
  const ledgerTotals = executor
    .select({
      customerId: ledgerEntriesTable.customerId,
      total: sql<string>`SUM(${signedAmount})`.as("total"),
    })
    .from(ledgerEntriesTable)
    .groupBy(ledgerEntriesTable.customerId)
    .as("ledger_totals");
  const rows = await executor
    .select({
      customerId: customersTable.id,
      storedPaise: customersTable.balancePaise,
      ledgerPaise: sql<string>`COALESCE(${ledgerTotals.total}, 0)`,
    })
    .from(customersTable)
    .leftJoin(ledgerTotals, eq(ledgerTotals.customerId, customersTable.id))
    .where(
      and(
        isNull(customersTable.deletedAt),
        sql`${customersTable.balancePaise} <> COALESCE(${ledgerTotals.total}, 0)`,
      ),
    );
  return rows.map((row) => ({ ...row, ledgerPaise: Number(row.ledgerPaise) }));
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
