import type { NotificationMessageGateway } from "@repo/services/customer-messages";
import type { NotificationStatusView, NotificationTemplateView } from "@repo/services/notification";

import { createNotificationClient, type NotificationClientConfig } from "./client";
import { rethrowWithRefusal } from "./token-gateway";

type WireStatusView = Omit<NotificationStatusView, "lastAttemptAt" | "createdAt" | "updatedAt"> & {
  lastAttemptAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type WireTemplateView = Omit<NotificationTemplateView, "createdAt"> & { createdAt: Date | string };

// No transformer on the client link, so dates arrive as ISO strings.
function toStatusView(row: WireStatusView): NotificationStatusView {
  return {
    ...row,
    lastAttemptAt: row.lastAttemptAt === null ? null : new Date(row.lastAttemptAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function toTemplateView(template: WireTemplateView): NotificationTemplateView {
  return { ...template, createdAt: new Date(template.createdAt) };
}

// The notification app's message procedures over the typed client with the internal key (Spec
// J). A refused call keeps K's machine reason (template_superseded, ...). Null while the main API
// runs without NOTIFICATION_URL / NOTIFICATION_INTERNAL_API_KEY.
export function createCustomerMessageGateway(
  config: NotificationClientConfig | null,
): NotificationMessageGateway | null {
  if (!config) return null;
  const client = createNotificationClient(config);
  return {
    async enqueue(input) {
      const response = await client.enqueue.mutate(input).catch(rethrowWithRefusal);
      return response.data;
    },
    async listByBusinessRefs(input) {
      const response = await client.listByBusinessRefs.query(input).catch(rethrowWithRefusal);
      return response.data.map(toStatusView);
    },
    async getStatus(input) {
      const response = await client.getStatus.query(input).catch(rethrowWithRefusal);
      return toStatusView(response.data);
    },
    async resend(input) {
      const response = await client.resend.mutate(input).catch(rethrowWithRefusal);
      return response.data;
    },
    async suppress(input) {
      const response = await client.suppress.mutate(input).catch(rethrowWithRefusal);
      return response.data;
    },
    async resolveTemplate(input) {
      const response = await client.resolveTemplate.query(input).catch(rethrowWithRefusal);
      return toTemplateView(response.data);
    },
  };
}
