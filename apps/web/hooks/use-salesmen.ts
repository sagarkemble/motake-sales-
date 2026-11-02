import type { RouterInputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

import { emptyPaginatedResult } from "./shared/pagination";

interface UseSalesmenParams {
  salesmanId?: string;
  listFilters?: RouterInputs["salesmen"]["list"];
  historyFilters?: RouterInputs["salesmen"]["getHistory"];
  includeMyProfile?: boolean;
  enabled?: boolean;
}

export function useSalesmen({
  salesmanId,
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
  const salesmanByIdQuery = trpc.salesmen.getById.useQuery(
    { id: salesmanId ?? "" },
    { enabled: enabled && Boolean(salesmanId) },
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
  const reactivateSalesmanAccountMutation = trpc.salesmen.reactivate.useMutation({
    onSuccess: () => utils.salesmen.invalidate(),
  });
  const deleteSalesmanAccountMutation = trpc.salesmen.delete.useMutation({
    onSuccess: () => utils.salesmen.invalidate(),
  });
  const updateSalesmanAccountMutation = trpc.salesmen.update.useMutation({
    onSuccess: () => utils.salesmen.invalidate(),
  });

  return {
    salesmenPage:
      salesmenListQuery.data?.data ??
      emptyPaginatedResult(listFilters?.page, listFilters?.pageSize),
    isSalesmenListLoading: salesmenListQuery.isLoading,
    isSalesmenListError: salesmenListQuery.isError,
    refetchSalesmenList: salesmenListQuery.refetch,
    isSalesmenListFetching: salesmenListQuery.isFetching,

    salesmanHistory: salesmanHistoryQuery.data?.data ?? [],
    isSalesmanHistoryLoading: salesmanHistoryQuery.isLoading,
    isSalesmanHistoryError: salesmanHistoryQuery.isError,
    refetchSalesmanHistory: salesmanHistoryQuery.refetch,

    salesmanById: salesmanByIdQuery.data?.data ?? null,
    isSalesmanByIdLoading: salesmanByIdQuery.isLoading,
    isSalesmanByIdError: salesmanByIdQuery.isError,
    refetchSalesmanById: salesmanByIdQuery.refetch,

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

    reactivateSalesmanAccount: reactivateSalesmanAccountMutation.mutate,
    reactivateSalesmanAccountAsync: reactivateSalesmanAccountMutation.mutateAsync,
    isReactivatingSalesmanAccount: reactivateSalesmanAccountMutation.isPending,
    reactivateSalesmanAccountError: reactivateSalesmanAccountMutation.error ?? null,

    deleteSalesmanAccount: deleteSalesmanAccountMutation.mutate,
    deleteSalesmanAccountAsync: deleteSalesmanAccountMutation.mutateAsync,
    isDeletingSalesmanAccount: deleteSalesmanAccountMutation.isPending,
    deleteSalesmanAccountError: deleteSalesmanAccountMutation.error ?? null,

    updateSalesmanAccount: updateSalesmanAccountMutation.mutate,
    updateSalesmanAccountAsync: updateSalesmanAccountMutation.mutateAsync,
    isUpdatingSalesmanAccount: updateSalesmanAccountMutation.isPending,
    updateSalesmanAccountError: updateSalesmanAccountMutation.error ?? null,
  };
}
