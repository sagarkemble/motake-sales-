import { createProfile, getProfileById, softDeleteProfile, updateProfile } from "@repo/database/queries/auth";
import type { InsertProfile, SelectProfile, SelectSalesman } from "@repo/database/schema";

import { supabaseAdminClient } from "../clients/supabase-admin";
import { badRequest, notFound, unauthorized } from "../errors";
import SalesmanService from "../salesman";
import {
  appRoleSchema,
  createSalesmanAccountInputSchema,
  updateSalesmanAccountInputSchema,
  type AppRole,
  type AuthenticatedUser,
  type CreateSalesmanAccountInput,
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
    return { id: data.user.id, email: data.user.email ?? "", phone: data.user.phone, role };
  }

  public async createSalesmanAccount(
    input: CreateSalesmanAccountInput,
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

    try {
      await createProfile({
        id: data.user.id,
        role: salesmanRole,
        email: parsedInput.email,
        name: parsedInput.name,
        phone: parsedInput.phone,
      });
      const salesman = await this.salesmanService.createSalesman({
        id: data.user.id,
        salesmanCode: parsedInput.salesmanCode,
      });
      return { salesman, supabaseUserId: data.user.id };
    } catch (appRecordCreationError) {
      await supabaseAdminClient.auth.admin.deleteUser(data.user.id);
      throw appRecordCreationError;
    }
  }

  public async confirmPhoneNumber(accessToken: string, expectedProfileId: string): Promise<SelectProfile> {
    const authenticatedUser = await this.verifyAccessToken(accessToken);
    if (authenticatedUser.id !== expectedProfileId) {
      throw unauthorized("Access token does not match the signed-in user");
    }
    if (!authenticatedUser.phone) {
      throw badRequest("Phone number was not verified");
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

    const updatedProfile =
      Object.keys(profileChanges).length > 0
        ? await updateProfile(profileId, profileChanges)
        : await getProfileById(profileId);
    if (!updatedProfile) throw notFound("Profile not found");
    return updatedProfile;
  }

  public async deactivateSalesmanAccount(profileId: string): Promise<void> {
    await supabaseAdminClient.auth.admin.updateUserById(profileId, { ban_duration: "876000h" });
    await softDeleteProfile(profileId);
  }
}

export default AuthService;
