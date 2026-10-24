import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { entityStatusEnum } from "./enums";

export const routesTable = pgTable(
  "routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    name: varchar("name", { length: 120 }).notNull(),

    // Generated `rt-{slug}-{nnn}`. Never edited.
    code: varchar("code", { length: 64 }).notNull().unique(),

    // Full official state name. Default place of supply.
    deliveryState: varchar("delivery_state", { length: 64 }).notNull(),

    status: entityStatusEnum("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    // Hidden, never removed.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // Unique case-insensitive, including hidden Routes.
    uniqueIndex("routes_name_lower_unique").on(sql`lower(${table.name})`),
  ],
);

export type SelectRoute = typeof routesTable.$inferSelect;
export type InsertRoute = typeof routesTable.$inferInsert;
