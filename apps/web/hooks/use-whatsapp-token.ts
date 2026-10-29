import type { RouterOutputs } from "@repo/trpc/client";

import { trpc } from "~/trpc/client";

export type WhatsAppTokenSettings = RouterOutputs["settings"]["whatsappToken"]["status"]["data"];
export type WhatsAppTokenState = WhatsAppTokenSettings["state"];

// Re-checked every minute and on window focus, so the Admin banner clears by itself once the
// notification app reports messages going out again.
const STATUS_REFETCH_INTERVAL_MS = 60_000;

// The WhatsApp access token (Spec J-0): status for the Admin banner, paste a new token, and send
// the messages held while they were paused. Never holds the token.
export function useWhatsAppToken() {
  const utils = trpc.useUtils();

  const statusQuery = trpc.settings.whatsappToken.status.useQuery(undefined, {
    refetchInterval: STATUS_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const updateMutation = trpc.settings.whatsappToken.update.useMutation({
    onSuccess: (response) => utils.settings.whatsappToken.status.setData(undefined, response),
  });
  const sendWaitingMutation = trpc.settings.whatsappToken.sendWaiting.useMutation({
    onSettled: () => utils.settings.whatsappToken.status.invalidate(),
  });

  return {
    status: statusQuery.data?.data ?? null,
    isStatusLoading: statusQuery.isLoading,

    updateTokenAsync: updateMutation.mutateAsync,
    isUpdatingToken: updateMutation.isPending,

    sendWaitingAsync: sendWaitingMutation.mutateAsync,
    isSendingWaiting: sendWaitingMutation.isPending,
  };
}
