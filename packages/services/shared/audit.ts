import {
  recordAuditLog,
  type AuditAction,
  type AuditEntityType,
} from "@repo/database/queries/audit";
import { db } from "@repo/database";
import type { DbExecutor } from "@repo/database/queries/shared/executor";

export interface FieldChange {
  from: unknown;
  to: unknown;
}

// Fields whose value differs between the row before and after a write, as { field: {from, to} }.
export function changedFields<Row extends object>(
  before: Row,
  after: Row,
  fields: readonly (keyof Row)[],
): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  for (const field of fields) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (from !== to) changes[String(field)] = { from, to };
  }
  return changes;
}

// Changed fields as { field: { old, new } }, the payload of a Correct audit row (Specs E, I).
export function oldNewPayload(changes: Record<string, FieldChange>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(changes).map(([field, change]) => [field, { old: change.from, new: change.to }]),
  );
}

// The fields a create set, dropping the ones left empty.
export function createdFields(values: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined && value !== null),
  );
}

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  customerId?: string | null;
  reason?: string | null;
  payload?: Record<string, unknown> | null;
}

// One audit row per call. An update that changed nothing records nothing.
export async function recordAudit(entry: AuditEntry, executor: DbExecutor = db): Promise<void> {
  if (entry.action === "updated" && entry.payload && Object.keys(entry.payload).length === 0) {
    return;
  }
  await recordAuditLog(
    {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      customerId: entry.customerId ?? null,
      reason: entry.reason ?? null,
      payload: entry.payload ?? null,
    },
    executor,
  );
}
