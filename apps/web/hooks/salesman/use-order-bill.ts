import { trpc } from "~/trpc/client";

interface UseOrderBillParams {
  orderId?: string;
  enabled?: boolean;
}

/** The current Bill of one of the salesman's orders, or null while it has none. */
export function useOrderBill({ orderId, enabled = true }: UseOrderBillParams = {}) {
  const orderBillQuery = trpc.bills.getForOrder.useQuery(
    { orderId: orderId ?? "" },
    { enabled: enabled && Boolean(orderId) },
  );

  return {
    orderBill: orderBillQuery.data?.data ?? null,
    isOrderBillLoading: orderBillQuery.isLoading,
    isOrderBillError: orderBillQuery.isError,
    refetchOrderBill: orderBillQuery.refetch,
  };
}
