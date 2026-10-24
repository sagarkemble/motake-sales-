import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { profilesTable } from "./profile";

// Audit of the one successful Motake seed workbook load. A second row is refused.
export const seedLoadsTable = pgTable(
  "seed_loads",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    singleton: boolean("singleton").notNull().default(true).unique(),

    cutoffDate: date("cutoff_date").notNull(),

    filledBy: varchar("filled_by", { length: 120 }).notNull(),

    loadedBy: uuid("loaded_by")
      .notNull()
      .references(() => profilesTable.id),

    loadedAt: timestamp("loaded_at", { withTimezone: true }).defaultNow().notNull(),

    fileName: varchar("file_name", { length: 255 }).notNull(),

    routeCount: integer("route_count").notNull(),
    varietyCount: integer("variety_count").notNull(),
    customerCount: integer("customer_count").notNull(),
    openingCount: integer("opening_count").notNull(),
  },
  (table) => [check("seed_loads_singleton_check", sql`${table.singleton}`)],
);

export type SelectSeedLoad = typeof seedLoadsTable.$inferSelect;
export type InsertSeedLoad = typeof seedLoadsTable.$inferInsert;
