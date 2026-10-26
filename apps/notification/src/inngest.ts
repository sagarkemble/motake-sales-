import { logger } from "@repo/logger";
import type NotificationService from "@repo/services/notification";
import type { NotificationDispatcher, ProviderStatusUpdate } from "@repo/services/notification";
import { Inngest } from "inngest";

import { env } from "./env";

export const SEND_REQUESTED_EVENT = "notification/send.requested";
export const STATUS_RECEIVED_EVENT = "whatsapp/status.received";

// Inngest's default backoff; 6 tries in total.
const SEND_RETRIES = 5;
const HEALTH_TIMEOUT_MS = 3_000;

export const inngest = new Inngest({
  id: "motake-notification",
  baseUrl: env.INNGEST_BASE_URL,
  eventKey: env.INNGEST_EVENT_KEY,
  signingKey: env.INNGEST_SIGNING_KEY,
  isDev: false,
  logger,
});

// Puts a send job on the self-hosted Inngest server. The run key is the event id, so a repeat of
// the same run is dropped.
export class InngestDispatcher implements NotificationDispatcher {
  public async dispatch(notificationId: string, runKey: string): Promise<void> {
    await inngest.send({ id: runKey, name: SEND_REQUESTED_EVENT, data: { notificationId } });
  }

  public async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${env.INNGEST_BASE_URL}/health`, {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export function emitStatusEvents(statuses: (ProviderStatusUpdate & { eventId: string })[]) {
  if (statuses.length === 0) return Promise.resolve();
  return inngest.send(
    statuses.map(({ eventId, ...update }) => ({
      id: eventId,
      name: STATUS_RECEIVED_EVENT,
      data: update,
    })),
  );
}

// Thin wrappers: every decision lives in NotificationService.
export function createNotificationFunctions(notificationService: NotificationService) {
  const sendNotification = inngest.createFunction(
    {
      id: "send-notification",
      retries: SEND_RETRIES,
      concurrency: { key: "event.data.notificationId", limit: 1 },
      triggers: [{ event: SEND_REQUESTED_EVENT }],
    },
    async ({ event, step, attempt }) => {
      const notificationId = String(event.data.notificationId);
      // The provider call and the attempt row share this step, so the wamid is written before
      // the step is checkpointed. A transient error throws inside the step so the try re-runs.
      return step.run("send-attempt", async () => {
        const result = await notificationService.sendAttempt(notificationId, {
          tryIndex: attempt,
          isFinalTry: attempt >= SEND_RETRIES,
        });
        if (result.outcome === "retry") {
          throw new Error(`Transient ${result.failureCategory} sending ${notificationId}`);
        }
        return result;
      });
    },
  );

  const applyWhatsAppStatus = inngest.createFunction(
    { id: "apply-whatsapp-status", triggers: [{ event: STATUS_RECEIVED_EVENT }] },
    async ({ event, step }) =>
      step.run("apply-status", () =>
        notificationService.applyProviderStatus(event.data as ProviderStatusUpdate),
      ),
  );

  const recoverUnqueued = inngest.createFunction(
    { id: "recover-unqueued", triggers: [{ cron: "*/5 * * * *" }] },
    async ({ step }) =>
      step.run("recover", async () => {
        const recovered = await notificationService.recoverUnqueued();
        if (recovered.length > 0) {
          logger.info(`Re-queued ${recovered.length} notification(s) with a lost dispatch`, {
            notificationIds: recovered,
          });
        }
        return { recovered };
      }),
  );

  return [sendNotification, applyWhatsAppStatus, recoverUnqueued];
}
