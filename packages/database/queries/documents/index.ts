import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  billsTable,
  billVersionsTable,
  gatepassesTable,
  noteLinesTable,
  notesTable,
  ordersTable,
  paymentEventsTable,
  paymentsTable,
  profilesTable,
  salesmenTable,
  type SelectBill,
  type SelectBillVersion,
  type SelectNote,
  type SelectNoteLine,
  type SelectPayment,
  type SelectPaymentEvent,
} from "../../schema";
import { billCustomerId, type BillLetterhead, type BillLineStamp } from "../bills";
import { billIsCancelled } from "../bills/cancelled";
import type { DbExecutor } from "../shared/executor";

// bill_versions.header: the bills row as it stood at that version, read back from JSON
// (db-decisions/0006). Only the fields a Document prints are typed.
export interface BillVersionHeader {
  number: string;
  legalType: SelectBill["legalType"];
  letterhead: BillLetterhead;
  billDate: string;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
}

// One element of bill_versions.items: a bill_items row at that version, keeping its `id`.
export interface BillVersionItem {
  id: string;
  stamp: BillLineStamp;
  quantity: number;
  routePricePaise: number;
  exempt: boolean;
  gstRateBps: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface BillVersionSnapshot extends Pick<
  SelectBillVersion,
  "id" | "billId" | "versionNumber" | "pdfKey"
> {
  header: BillVersionHeader;
  items: BillVersionItem[];
}

const billVersionSnapshotColumns = {
  id: billVersionsTable.id,
  billId: billVersionsTable.billId,
  versionNumber: billVersionsTable.versionNumber,
  pdfKey: billVersionsTable.pdfKey,
  header: billVersionsTable.header,
  items: billVersionsTable.items,
};

function toSnapshot(row: {
  id: string;
  billId: string;
  versionNumber: number;
  pdfKey: string | null;
  header: unknown;
  items: unknown;
}): BillVersionSnapshot {
  return {
    ...row,
    header: row.header as BillVersionHeader,
    items: row.items as BillVersionItem[],
  };
}

export async function getBillVersionSnapshot(
  billVersionId: string,
  executor: DbExecutor = db,
): Promise<BillVersionSnapshot | undefined> {
  const [row] = await executor
    .select(billVersionSnapshotColumns)
    .from(billVersionsTable)
    .where(eq(billVersionsTable.id, billVersionId));
  return row ? toSnapshot(row) : undefined;
}

export async function getLatestBillVersionSnapshot(
  billId: string,
  executor: DbExecutor = db,
): Promise<BillVersionSnapshot | undefined> {
  const [row] = await executor
    .select(billVersionSnapshotColumns)
    .from(billVersionsTable)
    .where(eq(billVersionsTable.billId, billId))
    .orderBy(desc(billVersionsTable.versionNumber))
    .limit(1);
  return row ? toSnapshot(row) : undefined;
}

export async function listBillVersionSnapshots(
  billVersionIds: string[],
  executor: DbExecutor = db,
): Promise<BillVersionSnapshot[]> {
  if (billVersionIds.length === 0) return [];
  const rows = await executor
    .select(billVersionSnapshotColumns)
    .from(billVersionsTable)
    .where(inArray(billVersionsTable.id, billVersionIds));
  return rows.map(toSnapshot);
}

export type BillDocumentState = Pick<SelectBill, "id" | "number" | "legalType"> & {
  // Through the Ledger Bill debit; null only for a ₹0 Bill with no order.
  customerId: string | null;
  cancelled: boolean;
  // The salesman of the GatePass the order left on (name, else salesman code); null for a Bill
  // with no GatePass: Admin Raise Bill and Admin fulfil.
  salesmanName: string | null;
};

// The live Bill fields a Document needs: legal type, the Customer and who dispatched it.
export async function getBillDocumentState(
  billId: string,
  executor: DbExecutor = db,
): Promise<BillDocumentState | undefined> {
  const [row] = await executor
    .select({
      id: billsTable.id,
      number: billsTable.number,
      legalType: billsTable.legalType,
      customerId: billCustomerId,
      cancelled: sql<boolean>`${billIsCancelled()}`,
      salesmanName: sql<
        string | null
      >`coalesce(${profilesTable.name}, ${salesmenTable.salesmanCode})`,
    })
    .from(billsTable)
    .leftJoin(ordersTable, eq(billsTable.orderId, ordersTable.id))
    .leftJoin(gatepassesTable, eq(ordersTable.gatepassId, gatepassesTable.id))
    .leftJoin(salesmenTable, eq(gatepassesTable.salesmanId, salesmenTable.id))
    .leftJoin(profilesTable, eq(salesmenTable.id, profilesTable.id))
    .where(eq(billsTable.id, billId));
  return row;
}

// Sets the key only while it is still empty and returns the key that is stored afterwards, so a
// writer that lost the race reads the winner's key.
export async function setBillVersionPdfKeyIfUnset(
  billVersionId: string,
  pdfKey: string,
  executor: DbExecutor = db,
): Promise<string | null> {
  const [updated] = await executor
    .update(billVersionsTable)
    .set({ pdfKey })
    .where(and(eq(billVersionsTable.id, billVersionId), isNull(billVersionsTable.pdfKey)))
    .returning({ pdfKey: billVersionsTable.pdfKey });
  if (updated) return updated.pdfKey;
  const [current] = await executor
    .select({ pdfKey: billVersionsTable.pdfKey })
    .from(billVersionsTable)
    .where(eq(billVersionsTable.id, billVersionId));
  return current?.pdfKey ?? null;
}

export async function getNoteById(
  noteId: string,
  executor: DbExecutor = db,
): Promise<SelectNote | undefined> {
  const [note] = await executor.select().from(notesTable).where(eq(notesTable.id, noteId));
  return note;
}

export async function listNoteLines(
  noteId: string,
  executor: DbExecutor = db,
): Promise<SelectNoteLine[]> {
  return executor
    .select()
    .from(noteLinesTable)
    .where(eq(noteLinesTable.noteId, noteId))
    .orderBy(asc(noteLinesTable.billVersionId), asc(noteLinesTable.id));
}

export async function setNotePdfKeyIfUnset(
  noteId: string,
  pdfKey: string,
  executor: DbExecutor = db,
): Promise<string | null> {
  const [updated] = await executor
    .update(notesTable)
    .set({ pdfKey })
    .where(and(eq(notesTable.id, noteId), isNull(notesTable.pdfKey)))
    .returning({ pdfKey: notesTable.pdfKey });
  if (updated) return updated.pdfKey;
  const [current] = await executor
    .select({ pdfKey: notesTable.pdfKey })
    .from(notesTable)
    .where(eq(notesTable.id, noteId));
  return current?.pdfKey ?? null;
}

export async function getPaymentById(
  paymentId: string,
  executor: DbExecutor = db,
): Promise<SelectPayment | undefined> {
  const [payment] = await executor
    .select()
    .from(paymentsTable)
    .where(eq(paymentsTable.id, paymentId));
  return payment;
}

export async function getPaymentEventById(
  paymentEventId: string,
  executor: DbExecutor = db,
): Promise<SelectPaymentEvent | undefined> {
  const [event] = await executor
    .select()
    .from(paymentEventsTable)
    .where(eq(paymentEventsTable.id, paymentEventId));
  return event;
}
