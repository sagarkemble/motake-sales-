import type { RouterInputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

interface UseReportsParams {
  dailyKpiFilters?: RouterInputs["reports"]["daily"];
  monthlyRange?: RouterInputs["reports"]["monthly"];
  productWiseSalesRange?: RouterInputs["reports"]["productWiseSales"];
  averageFulfillmentRange?: RouterInputs["reports"]["averageFulfillmentDuration"];
  enabled?: boolean;
}

export function useReports({
  dailyKpiFilters,
  monthlyRange,
  productWiseSalesRange,
  averageFulfillmentRange,
  enabled = true,
}: UseReportsParams = {}) {
  const unusedDateRange = { from: new Date(0), to: new Date(0) };

  const dailyKpiQuery = trpc.reports.daily.useQuery(
    dailyKpiFilters ?? { businessDate: "", placedFrom: new Date(0), placedTo: new Date(0) },
    { enabled: enabled && Boolean(dailyKpiFilters) },
  );
  const monthlyOrderVolumeQuery = trpc.reports.monthly.useQuery(monthlyRange ?? unusedDateRange, {
    enabled: enabled && Boolean(monthlyRange),
  });
  const productWiseSalesQuery = trpc.reports.productWiseSales.useQuery(
    productWiseSalesRange ?? unusedDateRange,
    { enabled: enabled && Boolean(productWiseSalesRange) },
  );
  const averageFulfillmentDurationQuery = trpc.reports.averageFulfillmentDuration.useQuery(
    averageFulfillmentRange ?? unusedDateRange,
    { enabled: enabled && Boolean(averageFulfillmentRange) },
  );

  return {
    dailyKpiSummary: dailyKpiQuery.data?.data ?? null,
    isDailyKpiSummaryLoading: dailyKpiQuery.isLoading,
    isDailyKpiSummaryError: dailyKpiQuery.isError,
    refetchDailyKpiSummary: dailyKpiQuery.refetch,

    monthlyOrderVolume: monthlyOrderVolumeQuery.data?.data ?? null,
    isMonthlyOrderVolumeLoading: monthlyOrderVolumeQuery.isLoading,
    isMonthlyOrderVolumeError: monthlyOrderVolumeQuery.isError,
    refetchMonthlyOrderVolume: monthlyOrderVolumeQuery.refetch,

    productWiseSales: productWiseSalesQuery.data?.data ?? [],
    isProductWiseSalesLoading: productWiseSalesQuery.isLoading,
    isProductWiseSalesError: productWiseSalesQuery.isError,
    refetchProductWiseSales: productWiseSalesQuery.refetch,

    averageFulfillmentSeconds: averageFulfillmentDurationQuery.data?.data.averageSeconds ?? null,
    isAverageFulfillmentDurationLoading: averageFulfillmentDurationQuery.isLoading,
    isAverageFulfillmentDurationError: averageFulfillmentDurationQuery.isError,
    refetchAverageFulfillmentDuration: averageFulfillmentDurationQuery.refetch,
  };
}
