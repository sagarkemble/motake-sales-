import { and, desc, eq, min, sql } from "drizzle-orm";

import { db } from "../../index";
import {
  auditLogsTable,
  billsTable,
  documentNumberSeriesTable,
  gstCreditNoteDeadlinesTable,
  profilesTable,
  sellerSettingsTable,
  type InsertSellerSettings,
  type SelectAuditLog,
  type SelectDocumentNumberSeries,
  type SelectGstCreditNoteDeadline,
  type SelectSellerSettings,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

export type SellerSettingsFields = Pick<
  InsertSellerSettings,
  | "legalName"
  | "address"
  | "state"
  | "gstin"
  | "phone"
  | "email"
  | "pan"
  | "bankAccountName"
  | "bankName"
  | "bankBranch"
  | "bankAccountNumber"
  | "bankIfsc"
  | "terms"
  | "place"
>;

// The schema has no single-row constraint; callers refuse to choose when this returns two rows.
export async function listSellerSettingsRows(
  executor: DbExecutor = db,
): Promise<SelectSellerSettings[]> {
  return executor.select().from(sellerSettingsTable).limit(2);
}

// Blocks a parallel setup until this transaction ends, so two setups cannot both insert.
export async function lockSellerSettingsTable(executor: DbExecutor): Promise<void> {
  await executor.execute(sql`LOCK TABLE ${sellerSettingsTable} IN EXCLUSIVE MODE`);
}

export async function lockSellerSettingsRows(
  executor: DbExecutor,
): Promise<SelectSellerSettings[]> {
  return executor.select().from(sellerSettingsTable).limit(2).for("update");
}

export async function insertSellerSettings(
  values: SellerSettingsFields & { updatedBy: string },
  executor: DbExecutor = db,
): Promise<SelectSellerSettings> {
  const insertedRows = await executor.insert(sellerSettingsTable).values(values).returning();
  return firstOrThrow(insertedRows, "insertSellerSettings");
}

export async function updateSellerSettingsRow(
  id: string,
  changes: Partial<SellerSettingsFields> & { updatedBy: string },
  executor: DbExecutor = db,
): Promise<SelectSellerSettings> {
  const updatedRows = await executor
    .update(sellerSettingsTable)
    .set(changes)
    .where(eq(sellerSettingsTable.id, id))
    .returning();
  return firstOrThrow(updatedRows, "updateSellerSettingsRow");
}

export async function updateSeriesPrefix(
  input: { seriesId: string; prefix: string; actorId: string },
  executor: DbExecutor = db,
): Promise<SelectDocumentNumberSeries> {
  const updatedRows = await executor
    .update(documentNumberSeriesTable)
    .set({ prefix: input.prefix, updatedBy: input.actorId })
    .where(eq(documentNumberSeriesTable.id, input.seriesId))
    .returning();
  return firstOrThrow(updatedRows, "updateSeriesPrefix");
}

export async function lockGstCreditNoteDeadlineRow(
  financialYear: string,
  executor: DbExecutor,
): Promise<SelectGstCreditNoteDeadline | undefined> {
  const [row] = await executor
    .select()
    .from(gstCreditNoteDeadlinesTable)
    .where(eq(gstCreditNoteDeadlinesTable.financialYear, financialYear))
    .for("update");
  return row;
}

// Returns undefined when a parallel save created the year's row first.
export async function insertGstCreditNoteDeadline(
  values: { financialYear: string; deadlineDate: string; updatedBy: string },
  executor: DbExecutor = db,
): Promise<SelectGstCreditNoteDeadline | undefined> {
  const [row] = await executor
    .insert(gstCreditNoteDeadlinesTable)
    .values(values)
    .onConflictDoNothing({ target: gstCreditNoteDeadlinesTable.financialYear })
    .returning();
  return row;
}

export async function updateGstCreditNoteDeadline(
  input: { id: string; deadlineDate: string; updatedBy: string },
  executor: DbExecutor = db,
): Promise<SelectGstCreditNoteDeadline> {
  const updatedRows = await executor
    .update(gstCreditNoteDeadlinesTable)
    .set({ deadlineDate: input.deadlineDate, updatedBy: input.updatedBy })
    .where(eq(gstCreditNoteDeadlinesTable.id, input.id))
    .returning();
  return firstOrThrow(updatedRows, "updateGstCreditNoteDeadline");
}

export interface EarliestSettingsUse {
  seriesFinancialYear: string | null;
  deadlineFinancialYear: string | null;
  billDate: string | null;
}

// `YY-YY` labels sort by year because every label reads as 20YY.
export async function getEarliestSettingsUse(
  executor: DbExecutor = db,
): Promise<EarliestSettingsUse> {
  const [series] = await executor
    .select({ value: min(documentNumberSeriesTable.financialYear) })
    .from(documentNumberSeriesTable);
  const [deadline] = await executor
    .select({ value: min(gstCreditNoteDeadlinesTable.financialYear) })
    .from(gstCreditNoteDeadlinesTable);
  const [bill] = await executor.select({ value: min(billsTable.billDate) }).from(billsTable);
  return {
    seriesFinancialYear: series?.value ?? null,
    deadlineFinancialYear: deadline?.value ?? null,
    billDate: bill?.value ?? null,
  };
}

export type SettingsHistoryEntry = Pick<
  SelectAuditLog,
  "id" | "action" | "actorId" | "reason" | "payload" | "createdAt"
> & { actorName: string };

// Audit rows of one settings record, newest first, with the actor's name (email when unnamed).
// Rows written by one transaction share created_at; among them `created` sorts as the oldest.
export async function listSettingsHistory(
  entityType: "seller_settings" | "document_number_series" | "gst_credit_note_deadline",
  entityId: string,
  executor: DbExecutor = db,
): Promise<SettingsHistoryEntry[]> {
  return executor
    .select({
      id: auditLogsTable.id,
      action: auditLogsTable.action,
      actorId: auditLogsTable.actorId,
      actorName: sql<string>`COALESCE(${profilesTable.name}, ${profilesTable.email})`,
      reason: auditLogsTable.reason,
      payload: auditLogsTable.payload,
      createdAt: auditLogsTable.createdAt,
    })
    .from(auditLogsTable)
    .innerJoin(profilesTable, eq(profilesTable.id, auditLogsTable.actorId))
    .where(and(eq(auditLogsTable.entityType, entityType), eq(auditLogsTable.entityId, entityId)))
    .orderBy(
      desc(auditLogsTable.createdAt),
      desc(sql`CASE WHEN ${auditLogsTable.action} = 'created' THEN 0 ELSE 1 END`),
    );
}
