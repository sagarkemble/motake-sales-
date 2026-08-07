import { useCallback, useEffect, useState } from "react";
import type { RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

type OrderHistoryRow = RouterOutputs["orders"]["list"]["data"]["items"][number];

interface UseOrderHistoryParams {
  pageSize?: number;
  enabled?: boolean;
}

export function useOrderHistory({ pageSize = 15, enabled = true }: UseOrderHistoryParams = {}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [loadedOrders, setLoadedOrders] = useState<OrderHistoryRow[]>([]);

  const orderHistoryQuery = trpc.orders.list.useQuery(
    { page: currentPage, pageSize },
    { enabled, placeholderData: (previousData) => previousData },
  );

  useEffect(() => {
    const fetchedItems = orderHistoryQuery.data?.data.items;
    if (!fetchedItems) return;

    setLoadedOrders((existingOrders) => {
      if (currentPage === 1) return fetchedItems;
      const existingOrderIds = new Set(existingOrders.map((row) => row.order.id));
      const newlyFetchedOrders = fetchedItems.filter((row) => !existingOrderIds.has(row.order.id));
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

  return {
    orderHistory: loadedOrders,
    isOrderHistoryLoading: orderHistoryQuery.isLoading,
    isLoadingMoreOrders: orderHistoryQuery.isFetching && currentPage > 1,
    hasMoreOrders,
    loadMoreOrders,
  };
}
