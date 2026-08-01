import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";

import { profilesTable } from "./profile";

export const salesmenTable = pgTable("salesmen", {
  id: uuid("id")
    .primaryKey()
    .references(() => profilesTable.id, { onDelete: "cascade" }),

  salesmanCode: varchar("salesman_code", { length: 32 }).notNull().unique(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .notNull(),
});

export type SelectSalesman = typeof salesmenTable.$inferSelect;
export type InsertSalesman = typeof salesmenTable.$inferInsert;
