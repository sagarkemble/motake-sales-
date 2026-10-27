import type { RouterInputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

import { emptyPaginatedResult } from "./shared/pagination";

interface UseCustomersParams {
  listFilters?: RouterInputs["customers"]["list"];
  customerId?: string;
  loadOpenOrders?: boolean;
  // Lifetime stats for a Customer's detail page; off where only the Customer is needed.
  loadStats?: boolean;
  enabled?: boolean;
}

export function useCustomers({
  listFilters,
  customerId,
  loadOpenOrders = false,
  loadStats = true,
  enabled = true,
}: UseCustomersParams = {}) {
  const utils = trpc.useUtils();

  const customersListQuery = trpc.customers.list.useQuery(
    listFilters ?? { page: 1, pageSize: 20 },
    {
      enabled: enabled && Boolean(listFilters),
    },
  );
  const customerQuery = trpc.customers.getById.useQuery(
    { id: customerId ?? "" },
    { enabled: enabled && Boolean(customerId) },
  );
  const customerStatsQuery = trpc.customers.getStats.useQuery(
    { id: customerId ?? "" },
    { enabled: enabled && Boolean(customerId) && loadStats },
  );
  const openOrdersQuery = trpc.customers.listOpenOrders.useQuery(
    { id: customerId ?? "" },
    { enabled: enabled && Boolean(customerId) && loadOpenOrders },
  );

  const createCustomerMutation = trpc.customers.create.useMutation({
    onSuccess: () => utils.customers.list.invalidate(),
  });
  const createShopPhotoUploadUrlMutation = trpc.customers.createShopPhotoUploadUrl.useMutation();
  const deleteCustomerShopPhotoMutation = trpc.customers.deleteShopPhoto.useMutation({
    onSuccess: () => utils.customers.invalidate(),
  });
  const updateCustomerMutation = trpc.customers.update.useMutation({
    onSuccess: () => utils.customers.invalidate(),
  });
  const deactivateCustomerMutation = trpc.customers.deactivate.useMutation({
    onSuccess: () => {
      utils.customers.invalidate();
      utils.orders.invalidate();
    },
  });
  const reactivateCustomerMutation = trpc.customers.reactivate.useMutation({
    onSuccess: () => utils.customers.invalidate(),
  });
  const moveCustomerRouteMutation = trpc.customers.moveRoute.useMutation({
    onSuccess: () => utils.customers.invalidate(),
  });

  return {
    customersPage:
      customersListQuery.data?.data ??
      emptyPaginatedResult(listFilters?.page, listFilters?.pageSize),
    isCustomersListLoading: customersListQuery.isLoading,
    isCustomersListError: customersListQuery.isError,
    refetchCustomersList: customersListQuery.refetch,

    customer: customerQuery.data?.data ?? null,
    isCustomerLoading: customerQuery.isLoading,
    isCustomerError: customerQuery.isError,
    refetchCustomer: customerQuery.refetch,

    customerStats: customerStatsQuery.data?.data ?? null,
    isCustomerStatsLoading: customerStatsQuery.isLoading,
    isCustomerStatsError: customerStatsQuery.isError,
    refetchCustomerStats: customerStatsQuery.refetch,

    openOrders: openOrdersQuery.data?.data ?? [],
    isOpenOrdersLoading: openOrdersQuery.isLoading,
    isOpenOrdersError: openOrdersQuery.isError,
    refetchOpenOrders: openOrdersQuery.refetch,

    createCustomer: createCustomerMutation.mutate,
    createCustomerAsync: createCustomerMutation.mutateAsync,
    isCreatingCustomer: createCustomerMutation.isPending,
    createCustomerError: createCustomerMutation.error ?? null,

    createShopPhotoUploadUrlAsync: createShopPhotoUploadUrlMutation.mutateAsync,
    isCreatingShopPhotoUploadUrl: createShopPhotoUploadUrlMutation.isPending,
    createShopPhotoUploadUrlError: createShopPhotoUploadUrlMutation.error ?? null,

    deleteCustomerShopPhotoAsync: deleteCustomerShopPhotoMutation.mutateAsync,
    isDeletingCustomerShopPhoto: deleteCustomerShopPhotoMutation.isPending,
    deleteCustomerShopPhotoError: deleteCustomerShopPhotoMutation.error ?? null,

    updateCustomer: updateCustomerMutation.mutate,
    updateCustomerAsync: updateCustomerMutation.mutateAsync,
    isUpdatingCustomer: updateCustomerMutation.isPending,
    updateCustomerError: updateCustomerMutation.error ?? null,

    deactivateCustomer: deactivateCustomerMutation.mutate,
    deactivateCustomerAsync: deactivateCustomerMutation.mutateAsync,
    isDeactivatingCustomer: deactivateCustomerMutation.isPending,
    deactivateCustomerError: deactivateCustomerMutation.error ?? null,

    reactivateCustomer: reactivateCustomerMutation.mutate,
    reactivateCustomerAsync: reactivateCustomerMutation.mutateAsync,
    isReactivatingCustomer: reactivateCustomerMutation.isPending,
    reactivateCustomerError: reactivateCustomerMutation.error ?? null,

    moveCustomerRouteAsync: moveCustomerRouteMutation.mutateAsync,
    isMovingCustomerRoute: moveCustomerRouteMutation.isPending,
  };
}
