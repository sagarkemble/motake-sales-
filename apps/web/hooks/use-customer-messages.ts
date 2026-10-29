import type { RouterInputs, RouterOutputs } from "@repo/trpc/client";

import { needsFastRefresh } from "~/lib/customer-messages";
import { trpc } from "~/trpc/client";

export type CustomerMessage =
  RouterOutputs["customerMessages"]["listForDocument"]["data"][number];
export type MessageDocument = RouterInputs["customerMessages"]["listForDocument"];

// While a message is still going out (or, on the checkout result, before it is made) the status
// is re-read every few seconds; otherwise every minute and on window focus, as the WhatsApp token
// banner does.
const FAST_REFETCH_INTERVAL_MS = 5_000;
const STATUS_REFETCH_INTERVAL_MS = 60_000;

interface UseCustomerMessagesParams {
  document: MessageDocument;
  // Checkout result: the messages are made just after Place, so an empty list is re-read fast.
  live?: boolean;
  enabled?: boolean;
}

// Spec J: the WhatsApp messages about one paper (Bill with its Notes, Note, Payment or Refund),
// Resend and Send latest Bill. The server decides every refusal; writes reload the list either way.
export function useCustomerMessages({
  document,
  live = false,
  enabled = true,
}: UseCustomerMessagesParams) {
  const utils = trpc.useUtils();

  const listQuery = trpc.customerMessages.listForDocument.useQuery(document, {
    enabled,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      if (query.state.status === "error") return false;
      const rows = query.state.data?.data;
      return rows && needsFastRefresh(rows, live)
        ? FAST_REFETCH_INTERVAL_MS
        : STATUS_REFETCH_INTERVAL_MS;
    },
  });

  const invalidate = () => utils.customerMessages.invalidate();
  const resendMutation = trpc.customerMessages.resend.useMutation({ onSettled: invalidate });
  const sendLatestBillMutation = trpc.customerMessages.sendLatestBill.useMutation({
    onSettled: invalidate,
  });

  return {
    messages: listQuery.data?.data ?? [],
    isMessagesLoading: listQuery.isLoading,
    messagesError: listQuery.error,
    refetchMessages: listQuery.refetch,

    resendAsync: resendMutation.mutateAsync,
    resendingId: resendMutation.isPending
      ? (resendMutation.variables?.notificationId ?? null)
      : null,

    sendLatestBillAsync: sendLatestBillMutation.mutateAsync,
    isSendingLatestBill: sendLatestBillMutation.isPending,
  };
}

export type CustomerMessagesState = ReturnType<typeof useCustomerMessages>;
