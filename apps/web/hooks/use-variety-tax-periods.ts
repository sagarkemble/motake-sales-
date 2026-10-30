import { trpc } from "~/trpc/client";

interface UseVarietyTaxPeriodsParams {
  /** Loads one Variety's periods for the Variety tax panel. */
  varietyId?: string | null;
  /** Loads the period covering today for each of these Varieties. */
  varietyIds?: string[];
  enabled?: boolean;
}

// Admin only: GST periods of a Variety. The rate crosses the API in basis points (5% is 500).
export function useVarietyTaxPeriods({
  varietyId,
  varietyIds = [],
  enabled = true,
}: UseVarietyTaxPeriodsParams = {}) {
  const utils = trpc.useUtils();

  const taxPeriodsQuery = trpc.products.listTaxPeriods.useQuery(
    { varietyId: varietyId ?? "" },
    { enabled: enabled && Boolean(varietyId) },
  );
  const currentTaxQuery = trpc.products.currentTaxForVarieties.useQuery(
    { varietyIds },
    { enabled: enabled && varietyIds.length > 0 },
  );

  const upsertTaxPeriodMutation = trpc.products.upsertTaxPeriod.useMutation({
    onSuccess: () => utils.products.invalidate(),
  });
  const deleteTaxPeriodMutation = trpc.products.deleteTaxPeriod.useMutation({
    onSuccess: () => utils.products.invalidate(),
  });

  return {
    taxPeriodList: taxPeriodsQuery.data?.data ?? null,
    isTaxPeriodListLoading: taxPeriodsQuery.isLoading,
    isTaxPeriodListError: taxPeriodsQuery.isError,
    refetchTaxPeriodList: taxPeriodsQuery.refetch,

    currentTaxes: currentTaxQuery.data?.data ?? [],
    isCurrentTaxesLoading: currentTaxQuery.isLoading,
    refetchCurrentTaxes: currentTaxQuery.refetch,
    isCurrentTaxesFetching: currentTaxQuery.isFetching,
    isCurrentTaxesError: currentTaxQuery.isError,

    upsertTaxPeriodAsync: upsertTaxPeriodMutation.mutateAsync,
    isUpsertingTaxPeriod: upsertTaxPeriodMutation.isPending,

    deleteTaxPeriodAsync: deleteTaxPeriodMutation.mutateAsync,
    isDeletingTaxPeriod: deleteTaxPeriodMutation.isPending,
  };
}
