import { createProfile, softDeleteProfile } from "@repo/database/queries/auth";
import type { SelectSalesman } from "@repo/database/schema";

import { supabaseAdminClient } from "../clients/supabase-admin";
import SalesmanService from "../salesman";
import {
  appRoleSchema,
  createSalesmanAccountInputSchema,
  type AppRole,
  type AuthenticatedUser,
  type CreateSalesmanAccountInput,
} from "./model";

class AuthService {
  private readonly salesmanService = new SalesmanService();

  public async verifyAccessToken(accessToken: string): Promise<AuthenticatedUser> {
    const { data, error } = await supabaseAdminClient.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new Error("Invalid or expired session");
    }

    const role = appRoleSchema.parse(data.user.app_metadata?.role);
    return { id: data.user.id, email: data.user.email ?? "", role };
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
      throw new Error(`Failed to create Supabase account: ${error?.message ?? "unknown error"}`);
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

  public async deactivateSalesmanAccount(profileId: string): Promise<void> {
    await supabaseAdminClient.auth.admin.updateUserById(profileId, { ban_duration: "876000h" });
    await softDeleteProfile(profileId);
  }
}

export default AuthService;
