import { refused } from "@repo/services/errors";
import type {
  NotificationTokenGateway,
  ResumeHeldResult,
  WhatsAppTokenStatus,
} from "@repo/services/whatsapp-token";
import { TRPCClientError } from "@trpc/client";

import { createNotificationClient, type NotificationClientConfig } from "./client";

interface WireTokenStatus {
  state: WhatsAppTokenStatus["state"];
  checkedAt: Date | string | null;
  heldCount: number;
}

// No transformer on the client link, so dates arrive as ISO strings.
function toTokenStatus(status: WireTokenStatus): WhatsAppTokenStatus {
  return {
    state: status.state,
    checkedAt: status.checkedAt === null ? null : new Date(status.checkedAt),
    heldCount: status.heldCount,
  };
}

// A refused call keeps its machine reason (`data.refusal`) so WhatsAppTokenService can branch on it.
function rethrowWithRefusal(error: unknown): never {
  if (error instanceof TRPCClientError) {
    const refusal = (error.data as { refusal?: { reason?: unknown; details?: unknown } } | null)
      ?.refusal;
    if (typeof refusal?.reason === "string") {
      throw refused(
        "CONFLICT",
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
