import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "../../index";
import { profilesTable, type InsertProfile, type SelectProfile } from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import type { DbExecutor } from "../shared/executor";

export async function createProfile(
  newProfile: InsertProfile,
  executor: DbExecutor = db,
): Promise<SelectProfile> {
  const insertedRows = await executor.insert(profilesTable).values(newProfile).returning();
  return firstOrThrow(insertedRows, "createProfile");
}

export async function getProfileById(profileId: string): Promise<SelectProfile | undefined> {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(and(eq(profilesTable.id, profileId), isNull(profilesTable.deletedAt)));
  return profile;
}

export async function getProfileByEmail(email: string): Promise<SelectProfile | undefined> {
  const [profile] = await db
    .select()
    .from(profilesTable)
    .where(and(eq(profilesTable.email, email), isNull(profilesTable.deletedAt)));
  return profile;
}

export async function listProfilesByRole(role: SelectProfile["role"]): Promise<SelectProfile[]> {
  return db
    .select()
    .from(profilesTable)
    .where(and(eq(profilesTable.role, role), isNull(profilesTable.deletedAt)));
}

export async function updateProfile(
  profileId: string,
  changes: Partial<InsertProfile>,
  executor: DbExecutor = db,
): Promise<SelectProfile | undefined> {
  const [updatedProfile] = await executor
    .update(profilesTable)
    .set(changes)
    .where(eq(profilesTable.id, profileId))
    .returning();
  return updatedProfile;
}

export async function softDeleteProfile(
  profileId: string,
  executor: DbExecutor = db,
): Promise<SelectProfile | undefined> {
  const [deactivatedProfile] = await executor
    .update(profilesTable)
    .set({ deletedAt: new Date(), status: "inactive" })
    .where(eq(profilesTable.id, profileId))
    .returning();
  return deactivatedProfile;
}

// Ends every Supabase Auth session of the user, so no refresh token works any more. A database
// without Supabase's `auth` schema (local tests) has no sessions to end.
export async function deleteAuthSessions(userId: string, executor: DbExecutor = db): Promise<void> {
  const { rows } = await executor.execute<{ exists: boolean }>(
    sql`select to_regclass('auth.sessions') is not null as exists`,
  );
  if (!rows[0]?.exists) return;
  await executor.execute(sql`delete from auth.sessions where user_id = ${userId}::uuid`);
}
