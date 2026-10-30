import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "../../index";
import {
  customersTable,
  profilesTable,
  refundEventsTable,
  refundsTable,
  routesTable,
  type InsertRefund,
  type InsertRefundEvent,
  type SelectRefund,
  type SelectRefundEvent,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

export async function insertRefund(
  newRefund: InsertRefund,
  executor: DbExecutor = db,
): Promise<SelectRefund> {
  const insertedRows = await executor.insert(refundsTable).values(newRefund).returning();
  return firstOrThrow(insertedRows, "insertRefund");
}

export async function insertRefundEvent(
  newEvent: InsertRefundEvent,
  executor: DbExecutor = db,
): Promise<SelectRefundEvent> {
  const insertedRows = await executor.insert(refundEventsTable).values(newEvent).returning();
  return firstOrThrow(insertedRows, "insertRefundEvent");
}

export async function getRefundByIdempotencyKey(
  idempotencyKey: string,
  executor: DbExecutor = db,
): Promise<SelectRefund | undefined> {
  const [refund] = await executor
    .select()
    .from(refundsTable)
    .where(eq(refundsTable.idempotencyKey, idempotencyKey));
  return refund;
}

// The one `posted` event every Refund starts with.
export async function getPostedRefundEvent(
  refundId: string,
  executor: DbExecutor = db,
): Promise<SelectRefundEvent | undefined> {
  const [event] = await executor
    .select()
    .from(refundEventsTable)
    .where(and(eq(refundEventsTable.refundId, refundId), eq(refundEventsTable.kind, "posted")));
  return event;
}

// Correct locks the Refund row first; the Customer is locked after it.
export async function lockRefundRow(
  refundId: string,
  executor: DbExecutor = db,
): Promise<SelectRefund | undefined> {
  const [refund] = await executor
    .select()
    .from(refundsTable)
    .where(eq(refundsTable.id, refundId))
    .for("update");
  return refund;
}

// The Add reason on `refunds.reason` is never overwritten; each Correct's reason is on its event.
export async function updateRefund(
  refundId: string,
  values: Pick<InsertRefund, "amountPaise" | "mode" | "reference">,
  executor: DbExecutor = db,
): Promise<SelectRefund> {
  const updatedRows = await executor
    .update(refundsTable)
    .set(values)
    .where(eq(refundsTable.id, refundId))
    .returning();
  return firstOrThrow(updatedRows, "updateRefund");
}

// The newest history event: Correct's concurrency token.
export async function getLatestRefundEvent(
  refundId: string,
  executor: DbExecutor = db,
): Promise<SelectRefundEvent | undefined> {
  const [event] = await executor
    .select()
    .from(refundEventsTable)
    .where(eq(refundEventsTable.refundId, refundId))
    .orderBy(
      desc(refundEventsTable.occurredAt),
      desc(refundEventsTable.createdAt),
      desc(refundEventsTable.id),
    )
    .limit(1);
  return event;
}

// A Refund with its Customer, the Customer's current Route (Refunds keep no Route snapshot) and who
// recorded it.
export async function getRefundPaperRow(refundId: string, executor: DbExecutor = db) {
  const [row] = await executor
    .select({
      refund: refundsTable,
      customer: {
        id: customersTable.id,
        shopName: customersTable.shopName,
        status: customersTable.status,
        deletedAt: customersTable.deletedAt,
      },
      routeName: routesTable.name,
      routeCode: routesTable.code,
      actorName: profilesTable.name,
    })
    .from(refundsTable)
    .innerJoin(customersTable, eq(refundsTable.customerId, customersTable.id))
    .innerJoin(routesTable, eq(customersTable.routeId, routesTable.id))
    .leftJoin(profilesTable, eq(refundsTable.actorId, profilesTable.id))
    .where(eq(refundsTable.id, refundId));
  return row;
}

// Oldest first, with who made each change.
export async function listRefundEventsWithActor(refundId: string, executor: DbExecutor = db) {
  return executor
    .select({ event: refundEventsTable, actorName: profilesTable.name })
    .from(refundEventsTable)
    .leftJoin(profilesTable, eq(refundEventsTable.actorId, profilesTable.id))
    .where(eq(refundEventsTable.refundId, refundId))
    .orderBy(
      asc(refundEventsTable.occurredAt),
      asc(refundEventsTable.createdAt),
      asc(refundEventsTable.id),
    );
}

// The Customer the Refund was paid to.
export async function getRefundCustomerId(
  refundId: string,
  executor: DbExecutor = db,
): Promise<string | null> {
  const [row] = await executor
    .select({ customerId: refundsTable.customerId })
    .from(refundsTable)
    .where(eq(refundsTable.id, refundId));
  return row?.customerId ?? null;
}
