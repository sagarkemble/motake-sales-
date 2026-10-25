import { and, desc, eq } from "drizzle-orm";

import { db } from "../../index";
import { auditLogsTable, type InsertAuditLog, type SelectAuditLog } from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

export type AuditEntityType = SelectAuditLog["entityType"];
export type AuditAction = SelectAuditLog["action"];

// Pass the write's transaction so the audit row commits with the change (db-decisions/0012).
export async function recordAuditLog(
  newAuditLog: InsertAuditLog,
  executor: DbExecutor = db,
): Promise<SelectAuditLog> {
  const insertedRows = await executor.insert(auditLogsTable).values(newAuditLog).returning();
  return firstOrThrow(insertedRows, "recordAuditLog");
}

export async function listAuditLogsForEntity(
  entityType: AuditEntityType,
  entityId: string,
): Promise<SelectAuditLog[]> {
  return db
    .select()
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.entityType, entityType), eq(auditLogsTable.entityId, entityId)))
    .orderBy(desc(auditLogsTable.createdAt));
}

export async function listAuditLogsByActor(actorId: string): Promise<SelectAuditLog[]> {
  return db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.actorId, actorId))
    .orderBy(desc(auditLogsTable.createdAt));
}
