import { refused } from "@repo/services/errors";
import type {
  NotificationTokenGateway,
  ResumeHeldResult,
  WhatsAppTokenStatus,
} from "@repo/services/whatsapp-token";
import { TRPCClientError } from "@trpc/client";
import { TRPC_ERROR_CODES_BY_KEY, type TRPC_ERROR_CODE_KEY } from "@trpc/server/rpc";

import { createNotificationClient, type NotificationClientConfig } from "./client";

type WireTokenStatus = Omit<WhatsAppTokenStatus, "checkedAt" | "lastWorkedAt"> & {
  checkedAt: Date | string | null;
  lastWorkedAt: Date | string | null;
};

function toDate(value: Date | string | null): Date | null {
  return value === null ? null : new Date(value);
}

// No transformer on the client link, so dates arrive as ISO strings.
function toTokenStatus(status: WireTokenStatus): WhatsAppTokenStatus {
  return {
    state: status.state,
    checkedAt: toDate(status.checkedAt),
    heldCount: status.heldCount,
    tokenHeldCount: status.tokenHeldCount,
    paymentHeldCount: status.paymentHeldCount,
    pausedReason: status.pausedReason,
    lastWorkedAt: toDate(status.lastWorkedAt),
  };
}

interface WireErrorData {
  code?: unknown;
  refusal?: { reason?: unknown; details?: unknown };
}

// The tRPC code the notification app answered with; INTERNAL_SERVER_ERROR if it is missing.
function errorCodeOf(data: WireErrorData | null): TRPC_ERROR_CODE_KEY {
  const code = data?.code;
  return typeof code === "string" && code in TRPC_ERROR_CODES_BY_KEY
    ? (code as TRPC_ERROR_CODE_KEY)
    : "INTERNAL_SERVER_ERROR";
}

// A refused call keeps its machine reason (`data.refusal`) and its tRPC code so
// WhatsAppTokenService and CustomerMessageService can branch on it.
export function rethrowWithRefusal(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const data = error.data as WireErrorData | null;
    const refusal = data?.refusal;
    if (typeof refusal?.reason === "string") {
      throw refused(
        errorCodeOf(data),
        refusal.reason,
        error.message,
        (refusal.details as Record<string, unknown> | null) ?? null,
      );
    }
  }
  throw error;
}

// The notification app's token procedures over the typed client with the internal key (Spec J-0).
// Null while the main API runs without NOTIFICATION_URL / NOTIFICATION_INTERNAL_API_KEY.
export function createNotificationTokenGateway(
  config: NotificationClientConfig | null,
): NotificationTokenGateway | null {
  if (!config) return null;
  const client = createNotificationClient(config);
  return {
    async tokenStatus(): Promise<WhatsAppTokenStatus> {
      const response = await client.tokenStatus.query().catch(rethrowWithRefusal);
      return toTokenStatus(response.data);
    },
    async refreshToken(): Promise<WhatsAppTokenStatus> {
      const response = await client.refreshToken.mutate().catch(rethrowWithRefusal);
      return toTokenStatus(response.data);
    },
    async resumeHeld(): Promise<ResumeHeldResult> {
      const response = await client.resumeHeld.mutate().catch(rethrowWithRefusal);
      return response.data;
    },
  };
}
