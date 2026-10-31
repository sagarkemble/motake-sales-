import { sql } from "drizzle-orm";
import { pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { profilesTable } from "./profile";

// A unit a Variety's size is measured in: ml, L, g, kg, then whatever Admin adds in Settings or
// from the Variety form. Never edited or deleted, so Varieties point at it by code.
export const unitsOfMeasureTable = pgTable(
  "units_of_measure",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // As typed, trimmed ("ml", "L", "pcs"); unique in any letter case.
    code: varchar("code", { length: 12 }).notNull().unique(),

    // Null for the four units the migration seeds.
    createdBy: uuid("created_by").references(() => profilesTable.id),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [uniqueIndex("units_of_measure_code_lower_unique").on(sql`lower(${table.code})`)],
);

export type SelectUnitOfMeasure = typeof unitsOfMeasureTable.$inferSelect;
export type InsertUnitOfMeasure = typeof unitsOfMeasureTable.$inferInsert;
