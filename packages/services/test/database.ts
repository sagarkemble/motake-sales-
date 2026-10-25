import { db, sql } from "@repo/database";

// Tests wipe the database at DATABASE_URL, so a run must opt in explicitly. CI sets it on the test
// job only; deploy never does.
export function assertDatabaseWipeAllowed(environment: NodeJS.ProcessEnv): void {
  if (environment.ALLOW_DB_WIPE !== "true") {
    throw new Error(
      "Refusing to run tests: they wipe every table at DATABASE_URL. Set ALLOW_DB_WIPE=true to allow it.",
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
