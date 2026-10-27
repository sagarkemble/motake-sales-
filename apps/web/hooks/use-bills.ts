import type { RouterInputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

import { emptyPaginatedResult } from "./shared/pagination";

interface UseBillsParams {
  listFilters?: RouterInputs["bills"]["list"];
  billId?: string;
  enabled?: boolean;
}

export function useBills({ listFilters, billId, enabled = true }: UseBillsParams = {}) {
  const utils = trpc.useUtils();

  const billsListQuery = trpc.bills.list.useQuery(listFilters ?? { page: 1, pageSize: 20 }, {
    enabled: enabled && Boolean(listFilters),
  });
  const billQuery = trpc.bills.getById.useQuery(
    { id: billId ?? "" },
    { enabled: enabled && Boolean(billId) },
  );

  return {
    billsPage:
      billsListQuery.data?.data ?? emptyPaginatedResult(listFilters?.page, listFilters?.pageSize),
    isBillsListLoading: billsListQuery.isLoading,
    isBillsListError: billsListQuery.isError,
    refetchBillsList: billsListQuery.refetch,

    bill: billQuery.data?.data ?? null,
    isBillLoading: billQuery.isLoading,
    refetchBill: billQuery.refetch,

    // Exact-number lookup, run on submit rather than per keystroke.
    findBillByNumber: async (number: string) =>
      (await utils.bills.getByNumber.fetch({ number })).data,
  };
}
