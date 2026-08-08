import {
  getAverageFulfillmentDurationSeconds,
  getDailyKpiSummary,
  getMonthlyOrderVolume,
  getProductWiseSalesSummary,
  type DailyKpiSummary,
  type MonthlyOrderVolume,
  type ProductSalesSummaryRow,
} from "@repo/database/queries/reports";

import {
  dailyKpiInputSchema,
  dateRangeInputSchema,
  type DailyKpiInput,
  type DateRangeInput,
} from "./model";

class ReportService {
  public async getDailyKpiSummary(input: DailyKpiInput): Promise<DailyKpiSummary> {
    const parsedInput = dailyKpiInputSchema.parse(input);
    return getDailyKpiSummary(parsedInput.businessDate, {
      from: parsedInput.placedFrom,
      to: parsedInput.placedTo,
    });
  }

  public async getMonthlyOrderVolume(range: DateRangeInput): Promise<MonthlyOrderVolume> {
    const parsedRange = dateRangeInputSchema.parse(range);
    return getMonthlyOrderVolume(parsedRange);
  }

  public async getProductWiseSalesSummary(
    range: DateRangeInput,
  ): Promise<ProductSalesSummaryRow[]> {
    const parsedRange = dateRangeInputSchema.parse(range);
    return getProductWiseSalesSummary(parsedRange);
  }

  public async getAverageFulfillmentDurationSeconds(range: DateRangeInput): Promise<number | null> {
    const parsedRange = dateRangeInputSchema.parse(range);
    return getAverageFulfillmentDurationSeconds(parsedRange);
  }
}

export default ReportService;
