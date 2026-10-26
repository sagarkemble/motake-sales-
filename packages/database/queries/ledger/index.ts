import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

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
