import {
  createSalesman,
  getSalesmanByCode,
  getSalesmanById,
  getSalesmanDayWiseHistory,
  getSalesmanWithProfileById,
  listActiveSalesmenWithProfiles,
  updateSalesmanCode,
  type SalesmanDayWiseHistoryRow,
  type SalesmanWithProfile,
} from "@repo/database/queries/salesman";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { SelectSalesman } from "@repo/database/schema";

import {
  createSalesmanInputSchema,
  listSalesmenInputSchema,
  salesmanHistoryRangeInputSchema,
  updateSalesmanCodeInputSchema,
  type CreateSalesmanInput,
  type ListSalesmenInput,
  type SalesmanHistoryRangeInput,
  type UpdateSalesmanCodeInput,
} from "./model";

class SalesmanService {
  public async createSalesman(input: CreateSalesmanInput): Promise<SelectSalesman> {
    const parsedInput = createSalesmanInputSchema.parse(input);
    const existingSalesmanWithCode = await getSalesmanByCode(parsedInput.salesmanCode);
    if (existingSalesmanWithCode) {
      throw new Error(`Salesman code ${parsedInput.salesmanCode} already in use`);
    }
    return createSalesman(parsedInput);
  }

  public async getSalesmanById(salesmanId: string): Promise<SelectSalesman | undefined> {
    return getSalesmanById(salesmanId);
  }

  public async getSalesmanWithProfile(salesmanId: string): Promise<SalesmanWithProfile | undefined> {
    return getSalesmanWithProfileById(salesmanId);
  }

  public async listSalesmen(input: ListSalesmenInput): Promise<PaginatedResult<SalesmanWithProfile>> {
    const parsedInput = listSalesmenInputSchema.parse(input);
    return listActiveSalesmenWithProfiles(parsedInput);
  }

  public async updateSalesmanCode(
    salesmanId: string,
    changes: UpdateSalesmanCodeInput,
  ): Promise<SelectSalesman | undefined> {
    const parsedChanges = updateSalesmanCodeInputSchema.parse(changes);
    const existingSalesmanWithCode = await getSalesmanByCode(parsedChanges.salesmanCode);
    if (existingSalesmanWithCode && existingSalesmanWithCode.id !== salesmanId) {
      throw new Error(`Salesman code ${parsedChanges.salesmanCode} already in use`);
    }
    return updateSalesmanCode(salesmanId, parsedChanges.salesmanCode);
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
