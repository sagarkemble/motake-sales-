import { and, eq, like, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  ledgerEntriesTable,
  paymentEventsTable,
  paymentsTable,
  type InsertPayment,
  type InsertPaymentEvent,
  type SelectPayment,
  type SelectPaymentEvent,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

export async function insertPayment(
  newPayment: InsertPayment,
  executor: DbExecutor = db,
): Promise<SelectPayment> {
  const insertedRows = await executor.insert(paymentsTable).values(newPayment).returning();
  return firstOrThrow(insertedRows, "insertPayment");
}

export async function insertPaymentEvent(
  newEvent: InsertPaymentEvent,
  executor: DbExecutor = db,
): Promise<SelectPaymentEvent> {
  const insertedRows = await executor.insert(paymentEventsTable).values(newEvent).returning();
  return firstOrThrow(insertedRows, "insertPaymentEvent");
}

export async function getPaymentByIdempotencyKey(
  idempotencyKey: string,
  executor: DbExecutor = db,
): Promise<SelectPayment | undefined> {
  const [payment] = await executor
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.idempotencyKey, idempotencyKey));
  return payment;
}

// The one `posted` event every Payment starts with.
export async function getPostedPaymentEvent(
  paymentId: string,
  executor: DbExecutor = db,
): Promise<SelectPaymentEvent | undefined> {
  const [event] = await executor
    .select()
    .from(paymentEventsTable)
    .where(and(eq(paymentEventsTable.paymentId, paymentId), eq(paymentEventsTable.kind, "posted")));
  return event;
}

// The checkout Payment taken with a Bill (Book Now or fulfil), found from the Bill rather than the
// request key, so a fulfil retried under another key still sees it. Checkout posts it in the
// Bill's transaction by the same actor for the same Customer, 1 ms after the Bill debit, under a
// `{key}:pay` key; a field Payment never has that suffix.
export async function getCheckoutPaymentForBill(
  billId: string,
  executor: DbExecutor = db,
): Promise<SelectPayment | undefined> {
  const [row] = await executor
    .select({ payment: paymentsTable })
    .from(ledgerEntriesTable)
    .innerJoin(
      paymentsTable,
      and(
        eq(paymentsTable.customerId, ledgerEntriesTable.customerId),
        eq(paymentsTable.actorId, ledgerEntriesTable.actorId),
        eq(
          paymentsTable.occurredAt,
          sql`${ledgerEntriesTable.occurredAt} + interval '1 millisecond'`,
        ),
        like(paymentsTable.idempotencyKey, "%:pay"),
      ),
    )
    .where(and(eq(ledgerEntriesTable.billId, billId), eq(ledgerEntriesTable.entryType, "bill")));
  return row?.payment;
}
