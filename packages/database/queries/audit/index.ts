import { and, desc, eq } from "drizzle-orm";

import { db } from "../../index";
import { auditLogsTable, type InsertAuditLog, type SelectAuditLog } from "../../schema";
import { firstOrThrow } from "../shared/assertions";

export async function recordAuditLog(newAuditLog: InsertAuditLog): Promise<SelectAuditLog> {
  const insertedRows = await db.insert(auditLogsTable).values(newAuditLog).returning();
  return firstOrThrow(insertedRows, "recordAuditLog");
}

export async function listAuditLogsForEntity(
  entityType: string,
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
