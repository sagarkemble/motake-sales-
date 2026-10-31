import { db, sql } from "@repo/database";

// Tests wipe every table, so they only run on a throwaway local Postgres (`pnpm test:local`, or
// CI's service container). Hosted Supabase projects are never test databases: motake-testing
// keeps the seeded data used for click-testing, and the root .env is production.
const LOCAL_DATABASE_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", "postgres"];

// True when the URL is a local Postgres.
export function isTestDatabaseUrl(databaseUrl: string | undefined): boolean {
  if (!databaseUrl) return false;
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return false;
  }
  return LOCAL_DATABASE_HOSTS.includes(url.hostname);
}

// Tests wipe the database at DATABASE_URL, so a run must opt in explicitly and point at a test
// database. CI sets ALLOW_DB_WIPE on the test job only; deploy never does.
export function assertDatabaseWipeAllowed(environment: NodeJS.ProcessEnv): void {
  if (environment.ALLOW_DB_WIPE !== "true") {
    throw new Error(
      "Refusing to run tests: they wipe every table at DATABASE_URL. Set ALLOW_DB_WIPE=true to allow it.",
    );
  }
  if (!isTestDatabaseUrl(environment.DATABASE_URL)) {
    throw new Error(
      "Refusing to run tests: DATABASE_URL is not a local Postgres. Run them with `pnpm test:local`.",
    );
  }
}

// Empties every table in the public schema. Drizzle's bookkeeping lives in its own schema and
// Supabase's auth schema is never touched.
export async function wipeApplicationTables(): Promise<void> {
  assertDatabaseWipeAllowed(process.env);
  const tableRows = await db.execute<{ tablename: string }>(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (tableRows.rows.length === 0) return;
  const tableList = tableRows.rows.map((row) => `"public"."${row.tablename}"`).join(", ");
  await db.execute(sql.raw(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`));
}

// Waits until some backend is blocked on a row lock (the call queued behind a test's lock holder).
export async function waitForLockWaiter(): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const rows = await db.execute<{ waiting: number }>(
      sql`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`,
    );
    if ((rows.rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("No transaction ever waited on the lock");
}

// Waits until some backend is blocked on an advisory lock (a filing queued behind the month lock).
export async function waitForAdvisoryLockWaiter(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const rows = await db.execute<{ waiting: number }>(
      sql`SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`,
    );
    if ((rows.rows[0]?.waiting ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("No transaction ever waited on the advisory lock");
}
