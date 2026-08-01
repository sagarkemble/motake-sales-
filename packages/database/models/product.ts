import { pgTable, uuid, varchar, timestamp, text } from "drizzle-orm/pg-core";

import { entityStatusEnum } from "./enums";

export const productsTable = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),

  name: varchar("name", { length: 200 }).notNull(),

  description: text("description"),

  imageKey: text("image_key"),

  imageUrl: text("image_url"),

  status: entityStatusEnum("status").notNull().default("active"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type SelectProduct = typeof productsTable.$inferSelect;
export type InsertProduct = typeof productsTable.$inferInsert;
