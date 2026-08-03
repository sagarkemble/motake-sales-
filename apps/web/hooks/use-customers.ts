import type { RouterInputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

import { emptyPaginatedResult } from "./shared/pagination";

interface UseCustomersParams {
  listFilters?: RouterInputs["customers"]["list"];
  customerId?: string;
  enabled?: boolean;
}

export function useCustomers({ listFilters, customerId, enabled = true }: UseCustomersParams = {}) {
  const utils = trpc.useUtils();

  const customersListQuery = trpc.customers.list.useQuery(listFilters ?? { page: 1, pageSize: 20 }, {
    enabled: enabled && Boolean(listFilters),
  });
  const customerQuery = trpc.customers.getById.useQuery(
    { id: customerId ?? "" },
    { enabled: enabled && Boolean(customerId) },
  );

  const createCustomerMutation = trpc.customers.create.useMutation({
    onSuccess: () => utils.customers.list.invalidate(),
  });
  const updateCustomerMutation = trpc.customers.update.useMutation({
    onSuccess: () => utils.customers.invalidate(),
  });
  const deactivateCustomerMutation = trpc.customers.deactivate.useMutation({
    onSuccess: () => utils.customers.invalidate(),
  });

  return {
    customersPage: customersListQuery.data?.data ?? emptyPaginatedResult(listFilters?.page, listFilters?.pageSize),
    isCustomersListLoading: customersListQuery.isLoading,
    isCustomersListError: customersListQuery.isError,
    refetchCustomersList: customersListQuery.refetch,

    customer: customerQuery.data?.data ?? null,
    isCustomerLoading: customerQuery.isLoading,
    isCustomerError: customerQuery.isError,
    refetchCustomer: customerQuery.refetch,

    createCustomer: createCustomerMutation.mutate,
    createCustomerAsync: createCustomerMutation.mutateAsync,
    isCreatingCustomer: createCustomerMutation.isPending,
    createCustomerError: createCustomerMutation.error ?? null,

    updateCustomer: updateCustomerMutation.mutate,
    updateCustomerAsync: updateCustomerMutation.mutateAsync,
    isUpdatingCustomer: updateCustomerMutation.isPending,
    updateCustomerError: updateCustomerMutation.error ?? null,

    deactivateCustomer: deactivateCustomerMutation.mutate,
    deactivateCustomerAsync: deactivateCustomerMutation.mutateAsync,
    isDeactivatingCustomer: deactivateCustomerMutation.isPending,
    deactivateCustomerError: deactivateCustomerMutation.error ?? null,
  };
}
