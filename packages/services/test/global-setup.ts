import { applyPendingMigrations } from "@repo/database/migrate";

import { assertDatabaseWipeAllowed } from "./database";

export default async function globalSetup(): Promise<void> {
  assertDatabaseWipeAllowed(process.env);
  await applyPendingMigrations();
}
