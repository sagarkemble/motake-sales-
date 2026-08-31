import { sql } from "drizzle-orm";
import { check, numeric, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { entityStatusEnum } from "./enums";
import { productsTable } from "./product";

export const productVarietiesTable = pgTable(
  "product_varieties",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),

    sku: varchar("sku", { length: 64 }).notNull().unique(),

    name: varchar("name", { length: 120 }).notNull(),

    unit: varchar("unit", { length: 32 }).notNull(),

    unitPrice: numeric("unit_price", { precision: 12, scale: 2, mode: "number" }).notNull(),

    status: entityStatusEnum("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [check("product_varieties_unit_price_check", sql`${table.unitPrice} >= 0`)],
);

export type SelectProductVariety = typeof productVarietiesTable.$inferSelect;
export type InsertProductVariety = typeof productVarietiesTable.$inferInsert;
