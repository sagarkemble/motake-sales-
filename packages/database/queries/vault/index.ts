import { sql } from "drizzle-orm";

import { db } from "../../index";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

// Supabase Vault (the `supabase_vault` extension, db-decisions/0016). Secrets are encrypted at
// rest and decrypted only through `vault.decrypted_secrets`. Callers never log `secret`.
export interface VaultSecretRow {
  id: string;
  secret: string;
  description: string;
  updatedAt: Date;
}

interface RawVaultSecretRow extends Record<string, unknown> {
  id: string;
  secret: string | null;
  description: string | null;
  updated_at: Date | string;
}

export async function getDecryptedVaultSecretByName(
  name: string,
  executor: DbExecutor = db,
): Promise<VaultSecretRow | undefined> {
  const result = await executor.execute<RawVaultSecretRow>(
    sql`SELECT id, decrypted_secret AS secret, description, updated_at
        FROM vault.decrypted_secrets WHERE name = ${name} LIMIT 1`,
  );
  const row = result.rows[0];
  if (!row) return undefined;
  return {
    id: row.id,
    secret: row.secret ?? "",
    description: row.description ?? "",
    updatedAt: new Date(row.updated_at),
  };
}

// Serializes create-or-update of one named secret until the transaction ends.
export async function lockVaultSecretName(name: string, executor: DbExecutor): Promise<void> {
  await executor.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`vault:${name}`}))`);
}

export async function createVaultSecret(
  values: { name: string; secret: string; description: string },
  executor: DbExecutor = db,
): Promise<string> {
  const result = await executor.execute<{ id: string }>(
    sql`SELECT vault.create_secret(${values.secret}, ${values.name}, ${values.description}) AS id`,
  );
  return firstOrThrow(result.rows, "createVaultSecret").id;
}

export async function updateVaultSecret(
  values: { id: string; secret: string; description: string },
  executor: DbExecutor = db,
): Promise<void> {
  await executor.execute(
    sql`SELECT vault.update_secret(${values.id}::uuid, ${values.secret}, NULL, ${values.description})`,
  );
}

// Test clean-up only: Vault lives outside `public`, so the table wipe never reaches it.
export async function deleteVaultSecretByName(
  name: string,
  executor: DbExecutor = db,
): Promise<void> {
  await executor.execute(sql`DELETE FROM vault.secrets WHERE name = ${name}`);
}
