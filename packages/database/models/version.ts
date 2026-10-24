import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { billsTable } from "./bill";
import { ordersTable } from "./order";
import { profilesTable } from "./profile";

// One row per Bill version, including v1. `header` is the full bills row and `items` the full
// bill_items rows at that moment; each item keeps its `id` so Notes can point at it
// (db-decisions/0006).
export const billVersionsTable = pgTable(
  "bill_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    billId: uuid("bill_id")
      .notNull()
      .references(() => billsTable.id, { onDelete: "restrict" }),

    // Starts at 1.
    versionNumber: integer("version_number").notNull(),

    header: jsonb("header").notNull(),

    items: jsonb("items").notNull(),

    // Version 1 reason is Raised.
    reason: text("reason").notNull(),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    // Immutable PDF for this version.
    pdfUrl: text("pdf_url"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("bill_versions_bill_version_unique").on(table.billId, table.versionNumber),
  ],
);

// One row per Order version, including v1 at place (db-decisions/0007).
export const orderVersionsTable = pgTable(
  "order_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "restrict" }),

    // Starts at 1.
    versionNumber: integer("version_number").notNull(),

    header: jsonb("header").notNull(),

    items: jsonb("items").notNull(),

    // Place, status change, fulfil, cancel.
    reason: text("reason").notNull(),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("order_versions_order_version_unique").on(table.orderId, table.versionNumber),
  ],
);

export type SelectBillVersion = typeof billVersionsTable.$inferSelect;
export type InsertBillVersion = typeof billVersionsTable.$inferInsert;
export type SelectOrderVersion = typeof orderVersionsTable.$inferSelect;
export type InsertOrderVersion = typeof orderVersionsTable.$inferInsert;
