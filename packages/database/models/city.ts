import { sql } from "drizzle-orm";
import { pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { profilesTable } from "./profile";

// A town a Customer is in, under one Indian state. Admin adds cities in Settings; Admin or a
// salesman can also add one from a Customer form. Never edited or deleted.
export const citiesTable = pgTable(
  "cities",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Trimmed, inner spaces collapsed; unique within its state in any letter case.
    name: varchar("name", { length: 120 }).notNull(),

    // Full official name from the Indian states list, like `routes.delivery_state`.
    state: varchar("state", { length: 120 }).notNull(),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => profilesTable.id),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("cities_state_name_unique").on(table.state, sql`lower(${table.name})`)],
);

export type SelectCity = typeof citiesTable.$inferSelect;
export type InsertCity = typeof citiesTable.$inferInsert;
