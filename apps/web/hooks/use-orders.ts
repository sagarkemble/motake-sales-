import type { RouterInputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

import { emptyPaginatedResult } from "./shared/pagination";

interface UseOrdersParams {
  listFilters?: RouterInputs["orders"]["list"];
  orderId?: string;
  detailOrderId?: string;
  duePreordersDate?: string;
  enabled?: boolean;
}

export function useOrders({
  listFilters,
  orderId,
  detailOrderId,
  duePreordersDate,
  enabled = true,
}: UseOrdersParams = {}) {
  const utils = trpc.useUtils();

  const ordersListQuery = trpc.orders.list.useQuery(listFilters ?? { page: 1, pageSize: 20 }, {
    enabled: enabled && Boolean(listFilters),
  });
  const orderQuery = trpc.orders.getById.useQuery(
    { id: orderId ?? "" },
    { enabled: enabled && Boolean(orderId) },
  );
  const orderDetailQuery = trpc.orders.getDetail.useQuery(
    { id: detailOrderId ?? "" },
    { enabled: enabled && Boolean(detailOrderId) },
  );
  const duePreordersQuery = trpc.orders.listDuePreorders.useQuery(
    { businessDate: duePreordersDate ?? "" },
    { enabled: enabled && Boolean(duePreordersDate) },
  );

  const placeBookNowOrderMutation = trpc.orders.placeBookNowOrder.useMutation({
    onSuccess: () => {
      utils.orders.invalidate();
      utils.gatepasses.invalidate();
    },
  });
  const placePreOrderMutation = trpc.orders.placePreOrder.useMutation({
    onSuccess: () => utils.orders.invalidate(),
  });
  const fulfillOrderMutation = trpc.orders.fulfill.useMutation({
    onSuccess: () => utils.orders.invalidate(),
  });
  const cancelOrderMutation = trpc.orders.cancel.useMutation({
    onSuccess: () => {
      utils.orders.invalidate();
      utils.gatepasses.invalidate();
    },
  });

  return {
    ordersPage: ordersListQuery.data?.data ?? emptyPaginatedResult(listFilters?.page, listFilters?.pageSize),
    isOrdersListLoading: ordersListQuery.isLoading,
    isOrdersListError: ordersListQuery.isError,
    refetchOrdersList: ordersListQuery.refetch,

    order: orderQuery.data?.data ?? null,
    isOrderLoading: orderQuery.isLoading,
    isOrderError: orderQuery.isError,
    refetchOrder: orderQuery.refetch,

    orderDetail: orderDetailQuery.data?.data ?? null,
    isOrderDetailLoading: orderDetailQuery.isLoading,
    isOrderDetailError: orderDetailQuery.isError,
    refetchOrderDetail: orderDetailQuery.refetch,

    duePreorders: duePreordersQuery.data?.data ?? [],
    isDuePreordersLoading: duePreordersQuery.isLoading,
    isDuePreordersError: duePreordersQuery.isError,
    refetchDuePreorders: duePreordersQuery.refetch,

    placeBookNowOrder: placeBookNowOrderMutation.mutate,
    placeBookNowOrderAsync: placeBookNowOrderMutation.mutateAsync,
    isPlacingBookNowOrder: placeBookNowOrderMutation.isPending,
    placeBookNowOrderError: placeBookNowOrderMutation.error ?? null,

    placePreOrder: placePreOrderMutation.mutate,
    placePreOrderAsync: placePreOrderMutation.mutateAsync,
    isPlacingPreOrder: placePreOrderMutation.isPending,
    placePreOrderError: placePreOrderMutation.error ?? null,

    fulfillOrder: fulfillOrderMutation.mutate,
    fulfillOrderAsync: fulfillOrderMutation.mutateAsync,
    isFulfillingOrder: fulfillOrderMutation.isPending,
    fulfillOrderError: fulfillOrderMutation.error ?? null,

    cancelOrder: cancelOrderMutation.mutate,
    cancelOrderAsync: cancelOrderMutation.mutateAsync,
    isCancellingOrder: cancelOrderMutation.isPending,
    cancelOrderError: cancelOrderMutation.error ?? null,
  };
}
