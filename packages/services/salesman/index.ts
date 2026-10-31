import {
  createSalesman,
  getSalesmanById,
  getSalesmanDayWiseHistory,
  getSalesmanWithProfileById,
  listSalesmanCodes,
  listSalesmenWithProfiles,
  type SalesmanDayWiseHistoryRow,
  type SalesmanListRow,
  type SalesmanWithProfile,
} from "@repo/database/queries/salesman";
import { db } from "@repo/database";
import { businessDateOf } from "@repo/database/queries/shared/business-date";
import type { DbExecutor } from "@repo/database/queries/shared/executor";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { SelectProfile, SelectSalesman } from "@repo/database/schema";

import {
  createProfileAvatarUploadUrl,
  deleteProfileAvatar,
  updateProfileNameAndAvatar,
  type ProfileAvatarUploadUrlResult,
} from "../shared/profile-avatar";
import { nextSalesmanCode } from "./code";
import {
  createSalesmanInputSchema,
  listSalesmenInputSchema,
  salesmanHistoryRangeInputSchema,
  type CreateAvatarUploadUrlInput,
  type CreateSalesmanInput,
  type ListSalesmenInput,
  type SalesmanHistoryRangeInput,
  type UpdateSalesmanProfileInput,
} from "./model";

class SalesmanService {
  // Generates the Salesman code once, from the name, phone and today's date; it never changes.
  public async createSalesman(
    input: CreateSalesmanInput,
    executor: DbExecutor = db,
  ): Promise<SelectSalesman> {
    const parsedInput = createSalesmanInputSchema.parse(input);
    const salesmanCode = nextSalesmanCode(
      parsedInput.name,
      parsedInput.phone,
      businessDateOf(new Date()),
      await listSalesmanCodes(executor),
    );
    return createSalesman({ id: parsedInput.id, salesmanCode }, executor);
  }

  public async getSalesmanById(salesmanId: string): Promise<SelectSalesman | undefined> {
    return getSalesmanById(salesmanId);
  }

  public async getSalesmanWithProfile(
    salesmanId: string,
  ): Promise<SalesmanWithProfile | undefined> {
    return getSalesmanWithProfileById(salesmanId);
  }

  public async listSalesmen(input: ListSalesmenInput): Promise<PaginatedResult<SalesmanListRow>> {
    const parsedInput = listSalesmenInputSchema.parse(input);
    return listSalesmenWithProfiles(
      { page: parsedInput.page, pageSize: parsedInput.pageSize },
      businessDateOf(new Date()),
      parsedInput.includeDeleted,
    );
  }

  public async updateSalesmanProfile(
    salesmanId: string,
    changes: UpdateSalesmanProfileInput,
  ): Promise<SelectProfile | undefined> {
    return updateProfileNameAndAvatar(salesmanId, changes);
  }

  public async deleteSalesmanAvatar(salesmanId: string): Promise<SelectProfile | undefined> {
    return deleteProfileAvatar(salesmanId);
  }

  public async createAvatarUploadUrl(
    salesmanId: string,
    input: CreateAvatarUploadUrlInput,
  ): Promise<ProfileAvatarUploadUrlResult> {
    return createProfileAvatarUploadUrl(salesmanId, input);
  }

  public async getDayWiseHistory(
    salesmanId: string,
    range: SalesmanHistoryRangeInput,
  ): Promise<SalesmanDayWiseHistoryRow[]> {
    const parsedRange = salesmanHistoryRangeInputSchema.parse(range);
    return getSalesmanDayWiseHistory(salesmanId, parsedRange);
  }
}

export default SalesmanService;

export { allowedAvatarImageContentTypes, createAvatarUploadUrlInputSchema } from "./model";
