import { trpc } from "~/trpc/client";

export function usePayments() {
  const utils = trpc.useUtils();

  const recordFieldPaymentMutation = trpc.payments.recordField.useMutation({
    onSuccess: () => {
      utils.customers.invalidate();
      utils.orders.quote.invalidate();
    },
    // A refusal (Balance moved, Customer moved off the Route) re-reads the Customer and Balance.
    onError: () => {
      utils.customers.invalidate();
      utils.orders.quote.invalidate();
    },
  });

  return {
    recordFieldPayment: recordFieldPaymentMutation.mutate,
    recordFieldPaymentAsync: recordFieldPaymentMutation.mutateAsync,
    isRecordingFieldPayment: recordFieldPaymentMutation.isPending,
    recordFieldPaymentError: recordFieldPaymentMutation.error ?? null,
  };
}
