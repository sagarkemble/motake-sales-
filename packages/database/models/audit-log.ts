import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { auditActionEnum, auditEntityTypeEnum } from "./enums";
import { customersTable } from "./customer";
import { profilesTable } from "./profile";

// Who did which Motake procedure to which record. Not a second Bill History or Ledger
// (db-decisions/0012).
export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    action: auditActionEnum("action").notNull(),

    entityType: auditEntityTypeEnum("entity_type").notNull(),

    // Polymorphic, no FK.
    entityId: uuid("entity_id").notNull(),

    // Set when the record is shop-scoped; null on catalog / settings / GatePass.
    customerId: uuid("customer_id").references(() => customersTable.id, { onDelete: "restrict" }),

    // Required in app on Correct / Cancel / portal cancel / Payment adjustment / Refund adjustment.
    reason: text("reason"),

    // Changed fields only; never snapshots, PDF, or WhatsApp.
    payload: jsonb("payload"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId, table.createdAt),
    index("audit_logs_actor_idx").on(table.actorId, table.createdAt),
    index("audit_logs_customer_idx")
      .on(table.customerId, table.createdAt)
      .where(sql`${table.customerId} IS NOT NULL`),
  ],
);

export type SelectAuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;
