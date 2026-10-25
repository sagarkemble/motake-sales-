import {
  createSalesman,
  getSalesmanByCode,
  getSalesmanById,
  getSalesmanDayWiseHistory,
  getSalesmanWithProfileById,
  listSalesmenWithProfiles,
  updateSalesmanCode,
  type SalesmanDayWiseHistoryRow,
  type SalesmanWithProfile,
} from "@repo/database/queries/salesman";
import { db } from "@repo/database";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { SelectProfile, SelectSalesman } from "@repo/database/schema";

import { conflict } from "../errors";
import { changedFields, recordAudit } from "../shared/audit";
import {
  createProfileAvatarUploadUrl,
  deleteProfileAvatar,
  updateProfileNameAndAvatar,
  type ProfileAvatarUploadUrlResult,
} from "../shared/profile-avatar";
import {
  createSalesmanInputSchema,
  listSalesmenInputSchema,
  salesmanHistoryRangeInputSchema,
  updateSalesmanCodeInputSchema,
  type CreateAvatarUploadUrlInput,
  type CreateSalesmanInput,
  type ListSalesmenInput,
  type SalesmanHistoryRangeInput,
  type UpdateSalesmanCodeInput,
  type UpdateSalesmanProfileInput,
} from "./model";

class SalesmanService {
  public async createSalesman(
    input: CreateSalesmanInput,
    executor: DbExecutor = db,
  ): Promise<SelectSalesman> {
    const parsedInput = createSalesmanInputSchema.parse(input);
    const existingSalesmanWithCode = await getSalesmanByCode(parsedInput.salesmanCode);
    if (existingSalesmanWithCode) {
      throw conflict(`Salesman code ${parsedInput.salesmanCode} already in use`);
    }
    return createSalesman(parsedInput, executor);
  }

  public async getSalesmanById(salesmanId: string): Promise<SelectSalesman | undefined> {
    return getSalesmanById(salesmanId);
  }

  public async getSalesmanWithProfile(
    salesmanId: string,
  ): Promise<SalesmanWithProfile | undefined> {
    return getSalesmanWithProfileById(salesmanId);
  }

  public async listSalesmen(
    input: ListSalesmenInput,
  ): Promise<PaginatedResult<SalesmanWithProfile>> {
    const parsedInput = listSalesmenInputSchema.parse(input);
    return listSalesmenWithProfiles(
      { page: parsedInput.page, pageSize: parsedInput.pageSize },
      parsedInput.includeDeleted,
    );
  }

  public async updateSalesmanCode(
    salesmanId: string,
    changes: UpdateSalesmanCodeInput,
    actorProfileId: string,
  ): Promise<SelectSalesman | undefined> {
    const parsedChanges = updateSalesmanCodeInputSchema.parse(changes);
    const existingSalesmanWithCode = await getSalesmanByCode(parsedChanges.salesmanCode);
    if (existingSalesmanWithCode && existingSalesmanWithCode.id !== salesmanId) {
      throw conflict(`Salesman code ${parsedChanges.salesmanCode} already in use`);
    }
    return runInTransaction(async (transaction) => {
      const before = await getSalesmanById(salesmanId, transaction);
      const after = await updateSalesmanCode(salesmanId, parsedChanges.salesmanCode, transaction);
      if (before && after) {
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "updated",
            entityType: "salesman",
            entityId: salesmanId,
            payload: changedFields(before, after, ["salesmanCode"]),
          },
          transaction,
        );
      }
      return after;
    });
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
