import { and, asc, desc, eq, like, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  customersTable,
  gatepassesTable,
  ledgerEntriesTable,
  paymentEventsTable,
  paymentsTable,
  profilesTable,
  routesTable,
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

// --- Payment paper and Correct (Spec H).

// Correct locks the Payment row first; no number is allocated and the Customer is locked after it.
export async function lockPaymentRow(
  paymentId: string,
  executor: DbExecutor = db,
): Promise<SelectPayment | undefined> {
  const [payment] = await executor
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, paymentId))
    .for("update");
  return payment;
}

export async function updatePayment(
  paymentId: string,
  values: Pick<InsertPayment, "amountKeptPaise" | "amountReceivedPaise" | "mode" | "reference">,
  executor: DbExecutor = db,
): Promise<SelectPayment> {
  const updatedRows = await executor
    .update(paymentsTable)
    .set(values)
    .where(eq(paymentsTable.id, paymentId))
    .returning();
  return firstOrThrow(updatedRows, "updatePayment");
}

// The newest history event: Correct's concurrency token.
export async function getLatestPaymentEvent(
  paymentId: string,
  executor: DbExecutor = db,
): Promise<SelectPaymentEvent | undefined> {
  const [event] = await executor
    .select()
    .from(paymentEventsTable)
    .where(eq(paymentEventsTable.paymentId, paymentId))
    .orderBy(
      desc(paymentEventsTable.occurredAt),
      desc(paymentEventsTable.createdAt),
      desc(paymentEventsTable.id),
    )
    .limit(1);
  return event;
}

// A Payment with its Customer, the Customer's current Route (Payments keep no Route snapshot), who
// recorded it and the GatePass a salesman took it against.
export async function getPaymentPaperRow(paymentId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select({
      payment: paymentsTable,
      customer: {
        id: customersTable.id,
        shopName: customersTable.shopName,
        status: customersTable.status,
        deletedAt: customersTable.deletedAt,
      },
      routeName: routesTable.name,
      routeCode: routesTable.code,
      actorName: profilesTable.name,
      gatepassBusinessDate: gatepassesTable.businessDate,
    })
    .from(paymentsTable)
    .innerJoin(customersTable, eq(paymentsTable.customerId, customersTable.id))
    .innerJoin(routesTable, eq(customersTable.routeId, routesTable.id))
    .leftJoin(profilesTable, eq(paymentsTable.actorId, profilesTable.id))
    .leftJoin(gatepassesTable, eq(paymentsTable.gatepassId, gatepassesTable.id))
    .where(eq(paymentsTable.id, paymentId));
  return row;
}

// Oldest first, with who made each change.
export async function listPaymentEventsWithActor(paymentId: string, executor: DbExecutor = db) {
  return executor
    .select({ event: paymentEventsTable, actorName: profilesTable.name })
    .from(paymentEventsTable)
    .leftJoin(profilesTable, eq(paymentEventsTable.actorId, profilesTable.id))
    .where(eq(paymentEventsTable.paymentId, paymentId))
    .orderBy(
      asc(paymentEventsTable.occurredAt),
      asc(paymentEventsTable.createdAt),
      asc(paymentEventsTable.id),
    );
}
