import { sql, type SQL } from "drizzle-orm";

// Interim rule (Spec A, #35): a Bill counts as cancelled when its linked order is cancelled.
// It cannot see a cancelled office Bill (no order). Spec G (#47) replaces this with its
// `isBillCancelled` audit-row predicate; every Bill read and report filters through here so
// that swap is one change.
export function billIsNotCancelled(): SQL {
  // Qualified by hand so the correlation holds in single-table selects on bills.
  return sql`NOT EXISTS (
    SELECT 1 FROM "orders" AS "cancelled_order"
    WHERE "cancelled_order"."id" = "bills"."order_id" AND "cancelled_order"."status" = 'cancelled'
  )`;
}
