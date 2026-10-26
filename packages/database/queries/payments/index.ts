import { and, eq } from "drizzle-orm";

import { db } from "../../index";
import {
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
