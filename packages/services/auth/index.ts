import {
  createProfile,
  getProfileById,
  softDeleteProfile,
  updateProfile,
} from "@repo/database/queries/auth";
import type { InsertProfile, SelectProfile, SelectSalesman } from "@repo/database/schema";

import { supabaseAdminClient } from "../clients/supabase-admin";
import { env } from "../env";
import { runInTransaction } from "@repo/database/queries/shared/executor";

import { badRequest, notFound, unauthorized } from "../errors";
import SalesmanService from "../salesman";
import { changedFields, createdFields, recordAudit } from "../shared/audit";
import {
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

class AuthService {
  private readonly salesmanService = new SalesmanService();

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

    const { data, error } = await supabaseAdminClient.auth.admin.createUser({
      email: parsedInput.email,
      password: parsedInput.password,
      email_confirm: true,
      app_metadata: { role: salesmanRole },
    });
    if (error || !data.user) {
      throw badRequest(`Failed to create Supabase account: ${error?.message ?? "unknown error"}`);
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
          },
          transaction,
        );
        const createdSalesman = await this.salesmanService.createSalesman(
          { id: supabaseUserId, salesmanCode: parsedInput.salesmanCode },
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
              salesmanCode: parsedInput.salesmanCode,
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

    if (parsedChanges.email || parsedChanges.password) {
      const { error } = await supabaseAdminClient.auth.admin.updateUserById(profileId, {
        email: parsedChanges.email,
        password: parsedChanges.password,
      });
      if (error) throw badRequest(`Failed to update Supabase account: ${error.message}`);
    }

    const profileChanges: Partial<InsertProfile> = {};
    if (parsedChanges.name !== undefined) profileChanges.name = parsedChanges.name;
    if (parsedChanges.phone !== undefined) profileChanges.phone = parsedChanges.phone;
    if (parsedChanges.email !== undefined) profileChanges.email = parsedChanges.email;

    const profileBefore = await getProfileById(profileId);
    if (!profileBefore) throw notFound("Profile not found");
    return runInTransaction(async (transaction) => {
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
            ...changedFields(profileBefore, updatedProfile, ["name", "phone", "email"]),
            ...(parsedChanges.password ? { passwordReset: true } : {}),
          },
        },
        transaction,
      );
      return updatedProfile;
    });
  }

  public async updateMyProfile(
    profileId: string,
    changes: UpdateMyProfileInput,
  ): Promise<SelectProfile | undefined> {
    return updateProfileNameAndAvatar(profileId, changes);
  }

  public async deleteMyAvatar(profileId: string): Promise<SelectProfile | undefined> {
    return deleteProfileAvatar(profileId);
  }

  public async createAvatarUploadUrl(
    profileId: string,
    input: CreateAvatarUploadUrlInput,
  ): Promise<ProfileAvatarUploadUrlResult> {
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

  public async deleteSalesmanAccount(profileId: string, actorProfileId: string): Promise<void> {
    await supabaseAdminClient.auth.admin.updateUserById(profileId, { ban_duration: "876000h" });
    await runInTransaction(async (transaction) => {
      await softDeleteProfile(profileId, transaction);
      await recordAudit(
        { actorId: actorProfileId, action: "deleted", entityType: "salesman", entityId: profileId },
        transaction,
      );
    });
  }

  public async reactivateSalesmanAccount(profileId: string, actorProfileId: string): Promise<void> {
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
