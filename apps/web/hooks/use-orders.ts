import type { RouterInputs } from "@repo/trpc/client";
import { keepPreviousData } from "@tanstack/react-query";

import { trpc } from "~/trpc/client";

import { emptyPaginatedResult } from "./shared/pagination";

interface UseOrdersParams {
  listFilters?: RouterInputs["orders"]["list"];
  orderId?: string;
  detailOrderId?: string;
  // Open Pre-orders on the salesman's Active GatePass Route.
  routePreorders?: boolean;
  // Server price and tax for a basket, or a Pre-order's fulfil from its locked terms.
  quoteInput?: RouterInputs["orders"]["quote"];
  enabled?: boolean;
}

export function useOrders({
  listFilters,
  orderId,
  detailOrderId,
  routePreorders = false,
  quoteInput,
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
  const routePreordersQuery = trpc.orders.listRoutePreorders.useQuery(undefined, {
    enabled: enabled && routePreorders,
    // No Active GatePass is an answer, not a failure to retry.
    retry: false,
  });

  const quoteQuery = trpc.orders.quote.useQuery(
    quoteInput ?? { lines: [], orderType: "book_now" },
    {
      enabled: enabled && Boolean(quoteInput),
      // Quantities change one tap at a time; keep the last quote on screen while the next loads.
      placeholderData: keepPreviousData,
      retry: false,
      // Stock and Balance move under other salesmen; never trust a quote from an earlier visit.
      staleTime: 0,
      refetchOnMount: "always",
    },
  );

  // A refused or failed write means stock, the Customer or their Balance moved: re-quote so the
  // next try is checked against what the server sees now.
  const refreshAfterRefusal = () => {
    utils.orders.invalidate();
    utils.customers.invalidate();
  };

  const placeBookNowOrderMutation = trpc.orders.placeBookNow.useMutation({
    onSuccess: () => {
      utils.orders.invalidate();
      utils.gatepasses.invalidate();
      utils.customers.invalidate();
      utils.bills.invalidate();
      utils.reports.invalidate();
    },
    onError: refreshAfterRefusal,
  });
  const placePreOrderMutation = trpc.orders.placePreOrder.useMutation({
    onSuccess: () => utils.orders.invalidate(),
    onError: refreshAfterRefusal,
  });
  const fulfillOrderMutation = trpc.orders.fulfilPreOrder.useMutation({
    onSuccess: () => {
      utils.orders.invalidate();
      utils.gatepasses.invalidate();
      utils.customers.invalidate();
      utils.bills.invalidate();
      utils.reports.invalidate();
    },
    onError: refreshAfterRefusal,
  });
  const cancelOrderMutation = trpc.orders.cancel.useMutation({
    onSuccess: () => {
      utils.orders.invalidate();
      utils.gatepasses.invalidate();
      utils.customers.invalidate();
      utils.ledger.invalidate();
      utils.bills.invalidate();
    },
  });

  return {
    ordersPage:
      ordersListQuery.data?.data ?? emptyPaginatedResult(listFilters?.page, listFilters?.pageSize),
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

    duePreorders: routePreordersQuery.data?.data ?? [],
    isDuePreordersLoading: routePreordersQuery.isLoading,
    isDuePreordersError: routePreordersQuery.isError,
    duePreordersError: routePreordersQuery.error ?? null,
    refetchDuePreorders: routePreordersQuery.refetch,

    quote: quoteQuery.data?.data ?? null,
    isQuoteLoading: quoteQuery.isLoading,
    isQuoteFetching: quoteQuery.isFetching,
    quoteError: quoteQuery.error ?? null,
    refetchQuote: quoteQuery.refetch,

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
