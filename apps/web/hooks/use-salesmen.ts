import type { RouterInputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

import { emptyPaginatedResult } from "./shared/pagination";

interface UseSalesmenParams {
  listFilters?: RouterInputs["salesmen"]["list"];
  historyFilters?: RouterInputs["salesmen"]["getHistory"];
  includeMyProfile?: boolean;
  enabled?: boolean;
}

export function useSalesmen({
  listFilters,
  historyFilters,
  includeMyProfile = false,
  enabled = true,
}: UseSalesmenParams = {}) {
  const utils = trpc.useUtils();

  const salesmenListQuery = trpc.salesmen.list.useQuery(listFilters ?? { page: 1, pageSize: 20 }, {
    enabled: enabled && Boolean(listFilters),
  });
  const salesmanHistoryQuery = trpc.salesmen.getHistory.useQuery(
    historyFilters ?? { id: "", from: "", to: "" },
    { enabled: enabled && Boolean(historyFilters?.id) },
  );
  const mySalesmanProfileQuery = trpc.salesmen.getMyProfile.useQuery(undefined, {
    enabled: enabled && includeMyProfile,
  });

  const createSalesmanAccountMutation = trpc.salesmen.create.useMutation({
    onSuccess: () => utils.salesmen.invalidate(),
  });
  const deactivateSalesmanAccountMutation = trpc.salesmen.deactivate.useMutation({
    onSuccess: () => utils.salesmen.invalidate(),
  });
  const updateSalesmanAccountMutation = trpc.salesmen.update.useMutation({
    onSuccess: () => utils.salesmen.invalidate(),
  });

  return {
    salesmenPage: salesmenListQuery.data?.data ?? emptyPaginatedResult(listFilters?.page, listFilters?.pageSize),
    isSalesmenListLoading: salesmenListQuery.isLoading,
    isSalesmenListError: salesmenListQuery.isError,
    refetchSalesmenList: salesmenListQuery.refetch,

    salesmanHistory: salesmanHistoryQuery.data?.data ?? [],
    isSalesmanHistoryLoading: salesmanHistoryQuery.isLoading,
    isSalesmanHistoryError: salesmanHistoryQuery.isError,
    refetchSalesmanHistory: salesmanHistoryQuery.refetch,

    mySalesmanProfile: mySalesmanProfileQuery.data?.data ?? null,
    isMySalesmanProfileLoading: mySalesmanProfileQuery.isLoading,
    isMySalesmanProfileError: mySalesmanProfileQuery.isError,
    refetchMySalesmanProfile: mySalesmanProfileQuery.refetch,

    createSalesmanAccount: createSalesmanAccountMutation.mutate,
    createSalesmanAccountAsync: createSalesmanAccountMutation.mutateAsync,
    isCreatingSalesmanAccount: createSalesmanAccountMutation.isPending,
    createSalesmanAccountError: createSalesmanAccountMutation.error ?? null,

    deactivateSalesmanAccount: deactivateSalesmanAccountMutation.mutate,
    deactivateSalesmanAccountAsync: deactivateSalesmanAccountMutation.mutateAsync,
    isDeactivatingSalesmanAccount: deactivateSalesmanAccountMutation.isPending,
    deactivateSalesmanAccountError: deactivateSalesmanAccountMutation.error ?? null,

    updateSalesmanAccount: updateSalesmanAccountMutation.mutate,
    updateSalesmanAccountAsync: updateSalesmanAccountMutation.mutateAsync,
    isUpdatingSalesmanAccount: updateSalesmanAccountMutation.isPending,
    updateSalesmanAccountError: updateSalesmanAccountMutation.error ?? null,
  };
}
