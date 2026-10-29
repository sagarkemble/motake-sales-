import { asc, eq, inArray, max } from "drizzle-orm";

import { db } from "../../index";
import {
  billsTable,
  billVersionsTable,
  ledgerEntriesTable,
  notesTable,
  paymentEventsTable,
  paymentsTable,
  refundEventsTable,
  refundsTable,
} from "../../schema";
import type { DbExecutor } from "../shared/executor";

// The documents a Customer's WhatsApp messages are about (Spec J). Messages have no FK to them:
// J rebuilds each message's opaque business_ref from these rows and asks the notification app.

export interface MessageBill {
  billId: string;
  latestVersionNumber: number;
  // Part of the latest Bill message's idempotency key once an IRN is recorded.
  irnRecordedAt: Date | null;
}

export interface MessageEvent {
  // The Payment or Refund id.
  documentId: string;
  eventId: string;
}

export interface CustomerMessageDocuments {
  bills: MessageBill[];
  noteIds: string[];
  paymentEvents: MessageEvent[];
  refundEvents: MessageEvent[];
}

async function listMessageBills(billIds: string[], executor: DbExecutor): Promise<MessageBill[]> {
  if (billIds.length === 0) return [];
  const rows = await executor
    .select({
      billId: billsTable.id,
      latestVersionNumber: max(billVersionsTable.versionNumber),
      irnRecordedAt: billsTable.irnRecordedAt,
    })
    .from(billsTable)
    .innerJoin(billVersionsTable, eq(billVersionsTable.billId, billsTable.id))
    .where(inArray(billsTable.id, billIds))
    .groupBy(billsTable.id)
    .orderBy(asc(billsTable.createdAt));
  return rows.map((row) => ({ ...row, latestVersionNumber: row.latestVersionNumber ?? 1 }));
}

// One Bill with its latest version and IRN stamp, or undefined when it does not exist.
export async function getMessageBill(
  billId: string,
  executor: DbExecutor = db,
): Promise<MessageBill | undefined> {
  const [bill] = await listMessageBills([billId], executor);
  return bill;
}

export async function listNoteIdsForBills(
  billIds: string[],
  executor: DbExecutor = db,
): Promise<string[]> {
  if (billIds.length === 0) return [];
  const rows = await executor
    .select({ id: notesTable.id })
    .from(notesTable)
    .where(inArray(notesTable.billId, billIds))
    .orderBy(asc(notesTable.createdAt), asc(notesTable.number));
  return rows.map((row) => row.id);
}

export async function listPaymentMessageEvents(
  paymentIds: string[],
  executor: DbExecutor = db,
): Promise<MessageEvent[]> {
  if (paymentIds.length === 0) return [];
  return executor
    .select({ documentId: paymentEventsTable.paymentId, eventId: paymentEventsTable.id })
    .from(paymentEventsTable)
    .where(inArray(paymentEventsTable.paymentId, paymentIds))
    .orderBy(asc(paymentEventsTable.occurredAt), asc(paymentEventsTable.createdAt));
}

export async function listRefundMessageEvents(
  refundIds: string[],
  executor: DbExecutor = db,
): Promise<MessageEvent[]> {
  if (refundIds.length === 0) return [];
  return executor
    .select({ documentId: refundEventsTable.refundId, eventId: refundEventsTable.id })
    .from(refundEventsTable)
    .where(inArray(refundEventsTable.refundId, refundIds))
    .orderBy(asc(refundEventsTable.occurredAt), asc(refundEventsTable.createdAt));
}

// Bills come from the Customer's Ledger Bill debits (a Bill has no customer_id); Payments and
// Refunds from their own customer_id.
export async function listCustomerMessageDocuments(
  customerId: string,
  executor: DbExecutor = db,
): Promise<CustomerMessageDocuments> {
  const billRows = await executor
    .selectDistinct({ billId: ledgerEntriesTable.billId })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.customerId, customerId));
  const billIds = billRows.flatMap((row) => (row.billId ? [row.billId] : []));
  const paymentRows = await executor
    .select({ id: paymentsTable.id })
    .from(paymentsTable)
    .where(eq(paymentsTable.customerId, customerId));
  const refundRows = await executor
    .select({ id: refundsTable.id })
    .from(refundsTable)
    .where(eq(refundsTable.customerId, customerId));

  const [bills, noteIds, paymentEvents, refundEvents] = await Promise.all([
    listMessageBills(billIds, executor),
    listNoteIdsForBills(billIds, executor),
    listPaymentMessageEvents(
      paymentRows.map((row) => row.id),
      executor,
    ),
    listRefundMessageEvents(
      refundRows.map((row) => row.id),
      executor,
    ),
  ]);
  return { bills, noteIds, paymentEvents, refundEvents };
}
