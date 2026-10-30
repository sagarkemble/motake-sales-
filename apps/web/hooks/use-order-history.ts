import { useCallback, useEffect, useState } from "react";
import type { RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

type OrderHistoryRow = RouterOutputs["orders"]["list"]["data"]["items"][number];

interface UseOrderHistoryParams {
  pageSize?: number;
  enabled?: boolean;
  salesmanId?: string;
}

export function useOrderHistory({
  pageSize = 15,
  enabled = true,
  salesmanId,
}: UseOrderHistoryParams = {}) {
  const utils = trpc.useUtils();
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedOrders, setLoadedOrders] = useState<OrderHistoryRow[]>([]);

  const orderHistoryQuery = trpc.orders.list.useQuery(
    { page: currentPage, pageSize, salesmanId },
    { enabled, placeholderData: (previousData) => previousData },
  );

  useEffect(() => {
    setCurrentPage(1);
    setLoadedOrders([]);
  }, [salesmanId]);

  useEffect(() => {
    const fetchedItems = orderHistoryQuery.data?.data.items;
    if (!fetchedItems) return;

    setLoadedOrders((existingOrders) => {
      if (currentPage === 1) return fetchedItems;
      const existingOrderIds = new Set(existingOrders.map((row) => row.id));
      const newlyFetchedOrders = fetchedItems.filter((row) => !existingOrderIds.has(row.id));
      return [...existingOrders, ...newlyFetchedOrders];
    });
  }, [orderHistoryQuery.data, currentPage]);

  const totalPages = orderHistoryQuery.data?.data.totalPages ?? 1;
  const hasMoreOrders = currentPage < totalPages;

  const loadMoreOrders = useCallback(() => {
    if (hasMoreOrders && !orderHistoryQuery.isFetching) {
      setCurrentPage((page) => page + 1);
    }
  }, [hasMoreOrders, orderHistoryQuery.isFetching]);

  // Reload: back to the first page, with every loaded page marked stale so each refetches.
  const refetchOrderHistory = useCallback(() => {
    setCurrentPage(1);
    return utils.orders.list.invalidate({ pageSize, salesmanId });
  }, [utils, pageSize, salesmanId]);

  return {
    orderHistory: loadedOrders,
    isOrderHistoryLoading: orderHistoryQuery.isLoading,
    isLoadingMoreOrders: orderHistoryQuery.isFetching && currentPage > 1,
    hasMoreOrders,
    loadMoreOrders,
    refetchOrderHistory,
    isOrderHistoryFetching: orderHistoryQuery.isFetching,
  };
}
