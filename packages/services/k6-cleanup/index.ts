import { sql } from "@repo/database";
import db from "@repo/database";
import { supabaseAdminClient } from "../clients/supabase-admin";

export type K6CleanupTargets = {
  profiles: Array<{ id: string; email: string; role: string; name: string | null }>;
  customers: Array<{ id: string; shop_name: string; phone: string; notes: string | null }>;
  orders: Array<{ id: string; order_code: string; notes: string | null; idempotency_key: string | null }>;
  gatepasses: Array<{ id: string; business_date: string; status: string; notes: string | null }>;
  auditLogs: Array<{ id: string }>;
  authUsers: Array<{ id: string; email: string }>;
};

export type K6CleanupCounts = {
  orderItemsDeleted: number;
  ordersDeleted: number;
  gatepassItemsDeleted: number;
  gatepassesDeleted: number;
  auditDeleted: number;
  customersDeleted: number;
  profilesDeleted: number;
  authDeleted: number;
};

type ProfileRow = { id: string; email: string; role: string; name: string | null };

// Drizzle expands a plain JS array into "($1, $2)::text[]", which is invalid Postgres.
// Build a proper ARRAY[$1, $2]::type[] expression instead.
function textArray(values: string[]) {
  if (values.length === 0) return sql`ARRAY[]::text[]`;
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::text[]`;
}

function uuidArray(values: string[]) {
  if (values.length === 0) return sql`ARRAY[]::uuid[]`;
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )}]::uuid[]`;
}

async function listSupabaseUsersByEmails(emails: Set<string>) {
  const authUsers: Array<{ id: string; email: string }> = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseAdminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    for (const user of data.users) {
      if (user.email && emails.has(user.email.toLowerCase())) {
        authUsers.push({ id: user.id, email: user.email });
      }
    }

    if (data.users.length < perPage) break;
    page++;
  }

  return authUsers;
}

export async function collectK6CleanupTargets(extraEmails: string[] = []): Promise<K6CleanupTargets> {
  const profileResult = await db.execute<ProfileRow>(sql`
    SELECT id, email, role, name
    FROM profiles
    WHERE deleted_at IS NULL
      AND (
        email ~* '^load-admin-[0-9]+@lunarstudio\\.dev$'
        OR email ~* '^load-salesman-[0-9]+@lunarstudio\\.dev$'
        OR email = ANY(${textArray(extraEmails)})
      )
  `);

  const profiles = profileResult.rows;
  const profileIds = profiles.map((row) => row.id);
  const salesmanIds = profiles.filter((row) => row.role === "salesman").map((row) => row.id);

  const customerResult = await db.execute(sql`
    SELECT id, shop_name, phone, notes
    FROM customers
    WHERE deleted_at IS NULL
      AND (
        notes ILIKE '%k6%'
        OR shop_name LIKE 'Load Shop %'
        OR contact_name LIKE 'Salesman %'
        OR (${profileIds.length} > 0 AND created_by = ANY(${uuidArray(profileIds)}))
      )
  `);

  const customers = customerResult.rows as K6CleanupTargets["customers"];
  const customerIds = customers.map((row) => row.id);

  const orderResult = await db.execute(sql`
    SELECT id, order_code, notes, idempotency_key
    FROM orders
    WHERE notes ILIKE '%k6%'
       OR idempotency_key LIKE 'k6-%'
       OR (${customerIds.length} > 0 AND customer_id = ANY(${uuidArray(customerIds)}))
       OR (${salesmanIds.length} > 0 AND salesman_id = ANY(${uuidArray(salesmanIds)}))
  `);

  const orders = orderResult.rows as K6CleanupTargets["orders"];
  const orderIds = orders.map((row) => row.id);

  const gatepassResult = await db.execute(sql`
    SELECT id, business_date, status, notes
    FROM gatepasses
    WHERE (${salesmanIds.length} > 0 AND salesman_id = ANY(${uuidArray(salesmanIds)}))
       OR notes ILIKE '%k6%'
  `);

  const gatepasses = gatepassResult.rows as K6CleanupTargets["gatepasses"];
  const gatepassIds = gatepasses.map((row) => row.id);

  const auditResult = await db.execute(sql`
    SELECT id FROM audit_logs
    WHERE ${profileIds.length} > 0 AND actor_id = ANY(${uuidArray(profileIds)})
  `);

  const auditLogs = auditResult.rows as K6CleanupTargets["auditLogs"];

  const profileEmailSet = new Set(profiles.map((row) => row.email.toLowerCase()));
  const authUsers = await listSupabaseUsersByEmails(profileEmailSet);

  return {
    profiles,
    customers,
    orders,
    gatepasses,
    auditLogs,
    authUsers,
  };
}

export async function executeK6Cleanup(targets: K6CleanupTargets): Promise<K6CleanupCounts> {
  const orderIds = targets.orders.map((row) => row.id);
  const customerIds = targets.customers.map((row) => row.id);
  const gatepassIds = targets.gatepasses.map((row) => row.id);
  const profileIds = targets.profiles.map((row) => row.id);
  const auditIds = targets.auditLogs.map((row) => row.id);

  let orderItemsDeleted = 0;
  if (orderIds.length) {
    const result = await db.execute(
      sql`DELETE FROM order_items WHERE order_id = ANY(${uuidArray(orderIds)})`,
    );
    orderItemsDeleted = result.rowCount ?? 0;
  }

  let ordersDeleted = 0;
  if (orderIds.length) {
    const result = await db.execute(sql`DELETE FROM orders WHERE id = ANY(${uuidArray(orderIds)})`);
    ordersDeleted = result.rowCount ?? 0;
  }

  let gatepassItemsDeleted = 0;
  if (gatepassIds.length) {
    const result = await db.execute(
      sql`DELETE FROM gatepass_items WHERE gatepass_id = ANY(${uuidArray(gatepassIds)})`,
    );
    gatepassItemsDeleted = result.rowCount ?? 0;
  }

  let gatepassesDeleted = 0;
  if (gatepassIds.length) {
    const result = await db.execute(
      sql`DELETE FROM gatepasses WHERE id = ANY(${uuidArray(gatepassIds)})`,
    );
    gatepassesDeleted = result.rowCount ?? 0;
  }

  let auditDeleted = 0;
  if (auditIds.length) {
    const result = await db.execute(
      sql`DELETE FROM audit_logs WHERE id = ANY(${uuidArray(auditIds)})`,
    );
    auditDeleted = result.rowCount ?? 0;
  }

  let customersDeleted = 0;
  if (customerIds.length) {
    const result = await db.execute(
      sql`DELETE FROM customers WHERE id = ANY(${uuidArray(customerIds)})`,
    );
    customersDeleted = result.rowCount ?? 0;
  }

  let profilesDeleted = 0;
  if (profileIds.length) {
    const result = await db.execute(
      sql`DELETE FROM profiles WHERE id = ANY(${uuidArray(profileIds)})`,
    );
    profilesDeleted = result.rowCount ?? 0;
  }

  let authDeleted = 0;
  for (const user of targets.authUsers) {
    const { error } = await supabaseAdminClient.auth.admin.deleteUser(user.id);
    if (error) throw error;
    authDeleted++;
  }

  return {
    orderItemsDeleted,
    ordersDeleted,
    gatepassItemsDeleted,
    gatepassesDeleted,
    auditDeleted,
    customersDeleted,
    profilesDeleted,
    authDeleted,
  };
}
