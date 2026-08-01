import { pgTable, uuid, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";

import { profilesTable } from "./profile";

export const auditLogsTable = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),

  actorId: uuid("actor_id")
    .notNull()
    .references(() => profilesTable.id),

  action: varchar("action", { length: 120 }).notNull(),

  entityType: varchar("entity_type", { length: 64 }).notNull(),

  entityId: uuid("entity_id").notNull(),

  payload: jsonb("payload"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SelectAuditLog = typeof auditLogsTable.$inferSelect;
export type InsertAuditLog = typeof auditLogsTable.$inferInsert;
