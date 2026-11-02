import {
  createProfile,
  deleteAuthSessions,
  getProfileById,
  getProfileByIdIncludingDeleted,
  isProfileEmailTaken,
  softDeleteProfile,
  updateProfile,
} from "@repo/database/queries/auth";
import type { InsertProfile, SelectProfile, SelectSalesman } from "@repo/database/schema";

import { supabaseAdminClient } from "../clients/supabase-admin";
import { env } from "../env";
import { runInTransaction } from "@repo/database/queries/shared/executor";

import {
  badRequest,
  forbidden,
  internalError,
  notFound,
  screenRefusal,
  unauthorized,
} from "../errors";
import GatepassService from "../gatepass";
import SalesmanService from "../salesman";
import { changedFields, createdFields, recordAudit } from "../shared/audit";
import { deleteObject } from "../uploads/r2-client";
import {
  adminUploadedAvatar,
  createProfileAvatarUploadUrl,
  deleteProfileAvatar,
  updateProfileNameAndAvatar,
  type ProfileAvatarUploadUrlResult,
} from "../shared/profile-avatar";
import {
  appRoleSchema,
  createSalesmanAccountInputSchema,
  updateSalesmanAccountInputSchema,
  type AppRole,
  type AuthenticatedUser,
  type CreateAvatarUploadUrlInput,
  type CreateSalesmanAccountInput,
  type UpdateMyProfileInput,
  type UpdateSalesmanAccountInput,
} from "./model";

// Supabase Auth error codes the Admin can fix in the form; any other failure stays a plain
// bad request, so the app shows its own "could not save" text.
const supabaseAccountReasons = {
  email_exists: "email_taken",
  user_already_exists: "email_taken",
  weak_password: "password_too_weak",
  email_address_invalid: "email_invalid",
} as const;

function supabaseAccountRefusal(message: string, code: string | undefined) {
  const reason = code
    ? supabaseAccountReasons[code as keyof typeof supabaseAccountReasons]
    : undefined;
  return reason ? screenRefusal(reason, message) : badRequest(message);
}

// `delete+{email}`, or `delete+2+{email}`, `delete+3+{email}` … when an earlier deleted account
// already holds it.
export async function deletedEmailFor(email: string): Promise<string> {
  let candidate = `delete+${email}`;
  for (let copy = 2; await isProfileEmailTaken(candidate); copy += 1) {
    candidate = `delete+${copy}+${email}`;
  }
  return candidate;
}

// A salesman's photo, name and phone are the Admin's to change; the salesman only reads them.
async function assertNotSalesman(profileId: string): Promise<void> {
  const profile = await getProfileById(profileId);
  if (profile?.role === "salesman") throw forbidden("Only your admin can change your details");
}

class AuthService {
  private readonly salesmanService = new SalesmanService();
  private readonly gatepassService = new GatepassService();

  public async verifyAccessToken(accessToken: string): Promise<AuthenticatedUser> {
    const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
    if (error || !data.user) {
      throw unauthorized("Invalid or expired session");
    }

    const role = appRoleSchema.parse(data.user.app_metadata?.role);
    return {
      id: data.user.id,
      email: data.user.email ?? "",
      phone: data.user.phone,
      phoneConfirmedAt: data.user.phone_confirmed_at,
      role,
    };
  }

  public async signInWithEmailPassword(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; user: AuthenticatedUser }> {
    const supabaseAnonKey =
      process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseAnonKey) {
      throw badRequest("Server is missing Supabase anon key configuration");
    }

    const tokenResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
      },
      body: JSON.stringify({ email, password }),
    });

    if (!tokenResponse.ok) {
      throw unauthorized("Invalid email or password");
    }

    const tokenBody = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenBody.access_token) {
      throw unauthorized("Invalid email or password");
    }

    const user = await this.verifyAccessToken(tokenBody.access_token);
    return { accessToken: tokenBody.access_token, user };
  }

  public async createSalesmanAccount(
    input: CreateSalesmanAccountInput,
    actorProfileId: string,
  ): Promise<{ salesman: SelectSalesman; supabaseUserId: string }> {
    const parsedInput = createSalesmanAccountInputSchema.parse(input);
    const salesmanRole: AppRole = "salesman";
    const avatar = parsedInput.avatarKey
      ? adminUploadedAvatar(parsedInput.avatarKey, actorProfileId)
      : undefined;

    const { data, error } = await supabaseAdminClient.auth.admin.createUser({
      email: parsedInput.email,
      password: parsedInput.password,
      email_confirm: true,
      app_metadata: { role: salesmanRole },
    });
    if (error || !data.user) {
      throw supabaseAccountRefusal(
        `Failed to create Supabase account: ${error?.message ?? "unknown error"}`,
        error?.code,
      );
    }

    const supabaseUserId = data.user.id;
    try {
      const salesman = await runInTransaction(async (transaction) => {
        await createProfile(
          {
            id: supabaseUserId,
            role: salesmanRole,
            email: parsedInput.email,
            name: parsedInput.name,
            phone: parsedInput.phone,
            ...avatar,
          },
          transaction,
        );
        const createdSalesman = await this.salesmanService.createSalesman(
          { id: supabaseUserId, name: parsedInput.name, phone: parsedInput.phone },
          transaction,
        );
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "created",
            entityType: "salesman",
            entityId: supabaseUserId,
            payload: createdFields({
              email: parsedInput.email,
              name: parsedInput.name,
              phone: parsedInput.phone,
              avatarKey: avatar?.avatarKey,
              salesmanCode: createdSalesman.salesmanCode,
            }),
          },
          transaction,
        );
        return createdSalesman;
      });
      return { salesman, supabaseUserId };
    } catch (appRecordCreationError) {
      await supabaseAdminClient.auth.admin.deleteUser(supabaseUserId);
      throw appRecordCreationError;
    }
  }

  public async getProfileById(profileId: string): Promise<SelectProfile | undefined> {
    return getProfileById(profileId);
  }

  public async confirmPhoneNumber(
    accessToken: string,
    expectedProfileId: string,
  ): Promise<SelectProfile> {
    const authenticatedUser = await this.verifyAccessToken(accessToken);
    if (authenticatedUser.id !== expectedProfileId) {
      throw unauthorized("Access token does not match the signed-in user");
    }
    if (!authenticatedUser.phone || !authenticatedUser.phoneConfirmedAt) {
      throw badRequest("Phone number was not verified by provider");
    }
    await assertNotSalesman(authenticatedUser.id);

    const updatedProfile = await updateProfile(authenticatedUser.id, {
      phone: authenticatedUser.phone,
    });
    if (!updatedProfile) throw notFound("Profile not found");
    return updatedProfile;
  }

  public async updateSalesmanAccount(
    profileId: string,
    changes: UpdateSalesmanAccountInput,
    actorProfileId: string,
  ): Promise<SelectProfile> {
    const parsedChanges = updateSalesmanAccountInputSchema.parse(changes);
    const avatar = parsedChanges.avatarKey
      ? adminUploadedAvatar(parsedChanges.avatarKey, actorProfileId)
      : parsedChanges.avatarKey;

    if (parsedChanges.email || parsedChanges.password) {
      const { error } = await supabaseAdminClient.auth.admin.updateUserById(profileId, {
        email: parsedChanges.email,
        password: parsedChanges.password,
      });
      if (error) {
        throw supabaseAccountRefusal(
          `Failed to update Supabase account: ${error.message}`,
          error.code,
        );
      }
    }

    const profileChanges: Partial<InsertProfile> = {};
    if (parsedChanges.name !== undefined) profileChanges.name = parsedChanges.name;
    if (parsedChanges.phone !== undefined) profileChanges.phone = parsedChanges.phone;
    if (parsedChanges.email !== undefined) profileChanges.email = parsedChanges.email;
    if (avatar === null) Object.assign(profileChanges, { avatarKey: null, avatarUrl: null });
    else if (avatar !== undefined) Object.assign(profileChanges, avatar);

    const profileBefore = await getProfileById(profileId);
    if (!profileBefore) throw notFound("Profile not found");
    const profileAfter = await runInTransaction(async (transaction) => {
      const updatedProfile =
        Object.keys(profileChanges).length > 0
          ? await updateProfile(profileId, profileChanges, transaction)
          : profileBefore;
      if (!updatedProfile) throw notFound("Profile not found");
      // Passwords are never written to the audit log; only that one was set.
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "updated",
          entityType: "salesman",
          entityId: profileId,
          payload: {
            ...changedFields(profileBefore, updatedProfile, [
              "name",
              "phone",
              "email",
              "avatarKey",
            ]),
            ...(parsedChanges.password ? { passwordReset: true } : {}),
          },
        },
        transaction,
      );
      return updatedProfile;
    });

    // The old photo goes once the new one (or none) is saved, as for the salesman's own avatar.
    if (profileBefore.avatarKey && profileBefore.avatarKey !== profileAfter.avatarKey) {
      await deleteObject(profileBefore.avatarKey);
    }
    return profileAfter;
  }

  public async updateMyProfile(
    profileId: string,
    changes: UpdateMyProfileInput,
  ): Promise<SelectProfile | undefined> {
    await assertNotSalesman(profileId);
    return updateProfileNameAndAvatar(profileId, changes);
  }

  public async deleteMyAvatar(profileId: string): Promise<SelectProfile | undefined> {
    await assertNotSalesman(profileId);
    return deleteProfileAvatar(profileId);
  }

  public async createAvatarUploadUrl(
    profileId: string,
    input: CreateAvatarUploadUrlInput,
  ): Promise<ProfileAvatarUploadUrlResult> {
    await assertNotSalesman(profileId);
    return createProfileAvatarUploadUrl(profileId, input);
  }

  public async deactivateSalesmanAccount(profileId: string, actorProfileId: string): Promise<void> {
    await runInTransaction(async (transaction) => {
      await updateProfile(profileId, { status: "inactive" }, transaction);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "deactivated",
          entityType: "salesman",
          entityId: profileId,
        },
        transaction,
      );
    });
  }

  // Removes every way in, for good: refused while the salesman holds an Active GatePass (hand it
  // over or close it first). The login is banned and its email renamed to `delete+{email}`, so the
  // email can be used for a new account; every session is ended and the profile soft-deleted, so
  // each later request is refused as account_deleted. A deleted salesman is never reactivated.
  public async deleteSalesmanAccount(profileId: string, actorProfileId: string): Promise<void> {
    const profile = await getProfileById(profileId);
    if (!profile) throw notFound(`Salesman ${profileId} not found`);
    if (await this.gatepassService.getActiveGatepassForSalesman(profileId)) {
      throw screenRefusal(
        "salesman_has_active_gatepass",
        "This salesman has an Active GatePass. Hand it over or close it, then delete.",
      );
    }
    const deletedEmail = await deletedEmailFor(profile.email);
    const { error } = await supabaseAdminClient.auth.admin.updateUserById(profileId, {
      email: deletedEmail,
      email_confirm: true,
      ban_duration: "876000h",
    });
    if (error) throw internalError(`The salesman login could not be blocked: ${error.message}`);
    await deleteAuthSessions(profileId);
    await runInTransaction(async (transaction) => {
      await softDeleteProfile(profileId, transaction);
      await updateProfile(profileId, { email: deletedEmail }, transaction);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "deleted",
          entityType: "salesman",
          entityId: profileId,
          payload: { email: { from: profile.email, to: deletedEmail } },
        },
        transaction,
      );
    });
  }

  public async reactivateSalesmanAccount(profileId: string, actorProfileId: string): Promise<void> {
    const profile = await getProfileByIdIncludingDeleted(profileId);
    if (!profile) throw notFound(`Salesman ${profileId} not found`);
    if (profile.deletedAt) {
      throw screenRefusal(
        "salesman_deleted",
        "This salesman was deleted and cannot be reactivated. Add them again.",
      );
    }
    await supabaseAdminClient.auth.admin.updateUserById(profileId, { ban_duration: "none" });
    await runInTransaction(async (transaction) => {
      await updateProfile(profileId, { status: "active", deletedAt: null }, transaction);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "activated",
          entityType: "salesman",
          entityId: profileId,
        },
        transaction,
      );
    });
  }
}

export default AuthService;
