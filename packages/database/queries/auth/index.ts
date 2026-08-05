import { and, eq, isNull } from "drizzle-orm";

import { db } from "../../index";
import { profilesTable, type InsertProfile, type SelectProfile } from "../../schema";
import { firstOrThrow } from "../shared/assertions";

export async function createProfile(newProfile: InsertProfile): Promise<SelectProfile> {
  const insertedRows = await db.insert(profilesTable).values(newProfile).returning();
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
): Promise<SelectProfile | undefined> {
  const [updatedProfile] = await db
    .update(profilesTable)
    .set(changes)
    .where(eq(profilesTable.id, profileId))
    .returning();
  return updatedProfile;
}

export async function softDeleteProfile(profileId: string): Promise<SelectProfile | undefined> {
  const [deactivatedProfile] = await db
    .update(profilesTable)
    .set({ deletedAt: new Date(), status: "inactive" })
    .where(eq(profilesTable.id, profileId))
    .returning();
  return deactivatedProfile;
}
