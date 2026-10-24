import { pgTable, uuid, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { entityStatusEnum } from "./enums";

// A named area with its own Customer list, price per variety, and default delivery state.
// Never physically deleted. Hide is gated in the app (no Active GatePass, no open Pre-order).
export const routesTable = pgTable(
  "routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Staff label; unique including hidden.
    name: varchar("name", { length: 120 }).notNull(),

    // `rt-{slug}-{nnn}`; generated; never edited.
    code: varchar("code", { length: 64 }).notNull(),

    // Full official name; default place of supply.
    deliveryState: varchar("delivery_state", { length: 120 }).notNull(),

    status: entityStatusEnum("status").notNull().default("active"),

    // Null = listed; set = hidden; row stays.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("routes_name_unique").on(table.name),
    uniqueIndex("routes_code_unique").on(table.code),
  ],
);

export type SelectRoute = typeof routesTable.$inferSelect;
export type InsertRoute = typeof routesTable.$inferInsert;
