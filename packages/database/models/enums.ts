import { pgEnum } from "drizzle-orm/pg-core";

export const appRoleEnum = pgEnum("app_role", ["admin", "salesman"]);

export const entityStatusEnum = pgEnum("entity_status", ["active", "inactive"]);

export const gatepassStatusEnum = pgEnum("gatepass_status", [
  "not_issued",
  "active",
  "pending_verification",
  "closed",
]);

export const gatepassShortReasonEnum = pgEnum("gatepass_short_reason", [
  "damaged",
  "expired",
  "lost",
  "leaked",
  "other",
]);

export const orderTypeEnum = pgEnum("order_type", ["book_now", "pre_order"]);

export const orderStatusEnum = pgEnum("order_status", [
  "confirmed",
  "scheduled",
  "due",
  "fulfilled",
  "cancelled",
]);
