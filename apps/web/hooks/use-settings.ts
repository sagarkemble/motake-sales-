import { trpc } from "~/trpc/client";

interface UseSettingsParams {
  financialYear?: string;
  enabled?: boolean;
}

export function useSettings({ financialYear, enabled = true }: UseSettingsParams = {}) {
  const utils = trpc.useUtils();

  const sellerQuery = trpc.settings.seller.get.useQuery(undefined, { enabled });
  const sellerSetupDefaultsQuery = trpc.settings.seller.setupDefaults.useQuery(undefined, {
    enabled,
  });
  const numberSeriesQuery = trpc.settings.numberSeries.list.useQuery(
    { financialYear: financialYear ?? "" },
    { enabled: enabled && Boolean(financialYear) },
  );
  const creditNoteDeadlinesQuery = trpc.settings.creditNoteDeadline.list.useQuery(undefined, {
    enabled,
  });

  const setUpSellerMutation = trpc.settings.seller.setUp.useMutation({
    onSuccess: () => utils.settings.seller.invalidate(),
  });
  const updateSellerMutation = trpc.settings.seller.update.useMutation({
    onSuccess: () => utils.settings.seller.invalidate(),
  });
  const updatePrefixMutation = trpc.settings.numberSeries.updatePrefix.useMutation({
    onSuccess: () => {
      utils.settings.numberSeries.invalidate();
      utils.settings.creditNoteDeadline.list.invalidate();
    },
  });
  const prepareYearMutation = trpc.settings.numberSeries.prepareYear.useMutation({
    onSuccess: () => utils.settings.numberSeries.invalidate(),
  });
  const setCreditNoteDeadlineMutation = trpc.settings.creditNoteDeadline.set.useMutation({
    onSuccess: () => utils.settings.creditNoteDeadline.invalidate(),
  });

  return {
    seller: sellerQuery.data?.data ?? null,
    isSellerLoading: sellerQuery.isLoading,
    isSellerError: sellerQuery.isError,
    refetchSeller: sellerQuery.refetch,

    sellerSetupDefaults: sellerSetupDefaultsQuery.data?.data ?? null,
    isSellerSetupDefaultsLoading: sellerSetupDefaultsQuery.isLoading,

    numberSeries: numberSeriesQuery.data?.data ?? [],
    isNumberSeriesLoading: numberSeriesQuery.isLoading,
    isNumberSeriesError: numberSeriesQuery.isError,
    refetchNumberSeries: numberSeriesQuery.refetch,

    creditNoteDeadlines: creditNoteDeadlinesQuery.data?.data ?? [],
    isCreditNoteDeadlinesLoading: creditNoteDeadlinesQuery.isLoading,
    isCreditNoteDeadlinesError: creditNoteDeadlinesQuery.isError,
    refetchCreditNoteDeadlines: creditNoteDeadlinesQuery.refetch,

    setUpSellerAsync: setUpSellerMutation.mutateAsync,
    isSettingUpSeller: setUpSellerMutation.isPending,

    updateSellerAsync: updateSellerMutation.mutateAsync,
    isUpdatingSeller: updateSellerMutation.isPending,

    updatePrefixAsync: updatePrefixMutation.mutateAsync,
    isUpdatingPrefix: updatePrefixMutation.isPending,

    prepareYearAsync: prepareYearMutation.mutateAsync,
    isPreparingYear: prepareYearMutation.isPending,

    setCreditNoteDeadlineAsync: setCreditNoteDeadlineMutation.mutateAsync,
    isSettingCreditNoteDeadline: setCreditNoteDeadlineMutation.isPending,
  };
}

export type SettingsHistorySubject =
  | { kind: "seller" }
  | { kind: "numberSeries"; seriesId: string }
  | { kind: "creditNoteDeadline"; financialYear: string };

// Loads one item's change history, only while its panel is open.
export function useSettingsHistory(subject: SettingsHistorySubject, enabled: boolean) {
  const sellerHistoryQuery = trpc.settings.seller.history.useQuery(undefined, {
    enabled: enabled && subject.kind === "seller",
  });
  const seriesHistoryQuery = trpc.settings.numberSeries.history.useQuery(
    { seriesId: subject.kind === "numberSeries" ? subject.seriesId : "" },
    { enabled: enabled && subject.kind === "numberSeries" },
  );
  const deadlineHistoryQuery = trpc.settings.creditNoteDeadline.history.useQuery(
    { financialYear: subject.kind === "creditNoteDeadline" ? subject.financialYear : "" },
    { enabled: enabled && subject.kind === "creditNoteDeadline" },
  );

  const activeQuery =
    subject.kind === "seller"
      ? sellerHistoryQuery
      : subject.kind === "numberSeries"
        ? seriesHistoryQuery
        : deadlineHistoryQuery;

  return {
    history: activeQuery.data?.data ?? [],
    isHistoryLoading: activeQuery.isLoading,
    isHistoryError: activeQuery.isError,
    refetchHistory: activeQuery.refetch,
  };
}
