import { pgTable, uuid, varchar, timestamp, text } from "drizzle-orm/pg-core";

import { appRoleEnum, entityStatusEnum } from "./enums";

export const profilesTable = pgTable("profiles", {
  // Matches auth.users.id — set on signup, not auto-generated
  id: uuid("id").primaryKey(),

  role: appRoleEnum("role").notNull(),

  email: varchar("email", { length: 255 }).notNull(),

  name: varchar("name", { length: 120 }),

  phone: varchar("phone", { length: 20 }),

  avatarKey: text("avatar_key"),

  avatarUrl: text("avatar_url"),

  status: entityStatusEnum("status").notNull().default("active"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export type SelectProfile = typeof profilesTable.$inferSelect;
export type InsertProfile = typeof profilesTable.$inferInsert;
