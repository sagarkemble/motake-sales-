import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db } from "./index";

// Applies every pending migration in ./drizzle. Used by the test suite before it runs.
export async function applyPendingMigrations(): Promise<void> {
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "drizzle") });
}
