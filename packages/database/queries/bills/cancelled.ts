import { and, eq, sql, type SQL } from "drizzle-orm";

import { db } from "../../index";
import { auditLogsTable } from "../../schema";
import type { DbExecutor } from "../shared/executor";

// The one definition of a cancelled Bill (Spec G, #47; db-decisions/0014). `bills` has no status
// column: Bill Cancel writes one audit_logs row (entity bill, action cancelled, entity_id the
// Bill id) and every read derives Cancelled from it, for order-backed and office Bills alike.

// Over a `bills` row; pass the alias when the query aliases `bills`. Qualified by hand so the
// correlation holds in single-table selects on bills.
export function billIsCancelled(billsAlias = "bills"): SQL {
  return sql`EXISTS (
    SELECT 1 FROM "audit_logs" AS "bill_cancelled"
    WHERE "bill_cancelled"."entity_type" = 'bill'
      AND "bill_cancelled"."action" = 'cancelled'
      AND "bill_cancelled"."entity_id" = ${sql.identifier(billsAlias)}."id"
  )`;
}

export function billIsNotCancelled(billsAlias = "bills"): SQL {
  return sql`NOT ${billIsCancelled(billsAlias)}`;
}

export async function isBillCancelled(billId: string, executor: DbExecutor = db): Promise<boolean> {
  const [row] = await executor
    .select({ id: auditLogsTable.id })
    .from(auditLogsTable)
    .where(
      and(
        eq(auditLogsTable.entityType, "bill"),
        eq(auditLogsTable.action, "cancelled"),
        eq(auditLogsTable.entityId, billId),
      ),
    )
    .limit(1);
  return Boolean(row);
}
