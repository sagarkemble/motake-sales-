import { randomUUID } from "node:crypto";

import { asc, db, eq, sql } from "@repo/database";
import {
  auditLogsTable,
  billItemsTable,
  billVersionsTable,
  customersTable,
  gatepassItemsTable,
  ledgerEntriesTable,
  noteLinesTable,
  notesTable,
} from "@repo/database/schema";
import { expect } from "vitest";

import { refusalOf as refusalCarriedBy, type Refusal } from "../errors";
import OrderService from "../orders";
import type { CheckoutWorld } from "./builders";

// Spec G tests: Bills written through the real checkout (Spec F) and the reads every Admin Bill
// test asserts on.

const orderService = new OrderService();

// 3 × Milk (₹24.99 at 5%) + 1 × Curd (₹40.00 exempt) = ₹118.71 → ₹119.00.
export const BOOK_NOW_TOTAL_PAISE = 11_900;

export async function placeBookNowBill(
  world: CheckoutWorld,
  options: { milkQty?: number; curdQty?: number; receivedPaise?: number; notes?: string } = {},
) {
  const lines = [
    { sku: world.milk.sku, qty: options.milkQty ?? 3 },
    ...(options.curdQty === 0 ? [] : [{ sku: world.curd.sku, qty: options.curdQty ?? 1 }]),
  ];
  return orderService.placeBookNow(world.salesman.id, {
    customerId: world.customer.id,
    idempotencyKey: randomUUID(),
    lines,
    notes: options.notes,
    payment: { mode: "cash", receivedPaise: options.receivedPaise ?? 0 },
  });
}

// The refusal a call was refused with (any spec's reasons).
export async function refusalOf(call: Promise<unknown>): Promise<Refusal> {
  const error = await call.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!error) throw new Error("Expected the call to be refused");
  const refusal = refusalCarriedBy(error);
  if (!refusal) throw error;
  return refusal;
}

// Spec B's rebuild check: the stored Balance equals Ledger Debits − Credits.
export async function expectBalanceMatchesLedger(customerId: string): Promise<number> {
  const [row] = await db
    .select({
      ledgerPaise: sql<string>`coalesce(sum(CASE WHEN ${ledgerEntriesTable.side} = 'debit' THEN ${ledgerEntriesTable.amountPaise} ELSE -${ledgerEntriesTable.amountPaise} END), 0)`,
    })
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.customerId, customerId));
  const [customer] = await db
    .select({ balancePaise: customersTable.balancePaise })
    .from(customersTable)
    .where(eq(customersTable.id, customerId));
  expect(customer!.balancePaise).toBe(Number(row!.ledgerPaise));
  return customer!.balancePaise;
}

export async function ledgerRowsOf(customerId: string) {
  return db
    .select()
    .from(ledgerEntriesTable)
    .where(eq(ledgerEntriesTable.customerId, customerId))
    .orderBy(asc(ledgerEntriesTable.occurredAt), asc(ledgerEntriesTable.createdAt));
}

export async function notesOf(billId: string) {
  return db
    .select()
    .from(notesTable)
    .where(eq(notesTable.billId, billId))
    .orderBy(asc(notesTable.createdAt), asc(notesTable.number));
}

export async function noteLinesOf(noteId: string) {
  return db.select().from(noteLinesTable).where(eq(noteLinesTable.noteId, noteId));
}

export async function versionsOf(billId: string) {
  return db
    .select()
    .from(billVersionsTable)
    .where(eq(billVersionsTable.billId, billId))
    .orderBy(asc(billVersionsTable.versionNumber));
}

export async function billItemsOf(billId: string) {
  return db
    .select()
    .from(billItemsTable)
    .where(eq(billItemsTable.billId, billId))
    .orderBy(asc(billItemsTable.createdAt), asc(billItemsTable.id));
}

export async function billAuditRows(billId: string) {
  return db
    .select()
    .from(auditLogsTable)
    .where(sql`${auditLogsTable.entityType} = 'bill' AND ${auditLogsTable.entityId} = ${billId}`);
}

export async function soldQtyByVariety(gatepassId: string) {
  const rows = await db
    .select({ varietyId: gatepassItemsTable.varietyId, soldQty: gatepassItemsTable.soldQty })
    .from(gatepassItemsTable)
    .where(eq(gatepassItemsTable.gatepassId, gatepassId));
  return Object.fromEntries(rows.map((row) => [row.varietyId, row.soldQty]));
}

// Bill debit + Debit Notes − Credit Notes posted for one Bill.
export async function billNetLedgerPaise(billId: string): Promise<number> {
  const [row] = await db
    .select({
      netPaise: sql<string>`coalesce(sum(CASE WHEN ${ledgerEntriesTable.side} = 'debit' THEN ${ledgerEntriesTable.amountPaise} ELSE -${ledgerEntriesTable.amountPaise} END), 0)`,
    })
    .from(ledgerEntriesTable)
    .leftJoin(notesTable, eq(ledgerEntriesTable.noteId, notesTable.id))
    .where(sql`${ledgerEntriesTable.billId} = ${billId} OR ${notesTable.billId} = ${billId}`);
  return Number(row!.netPaise);
}
