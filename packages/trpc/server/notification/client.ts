import { createTRPCClient, httpLink } from "@trpc/client";

import type { NotificationRouter } from "./index";

export interface NotificationClientConfig {
  // NOTIFICATION_URL, e.g. http://127.0.0.1:8100
  baseUrl: string;
  // NOTIFICATION_INTERNAL_API_KEY
  internalApiKey: string;
}

// Server-side typed client for the main API's delegate helper (Spec J). Import it from
// `@repo/trpc/server/notification/client`: the router is a type-only import, so this entry pulls
// in only @trpc/client, never NotificationService, the R2 reader or the Meta provider. Queries go as POST so a
// 200-ref status read never hits URL length limits.
export function createNotificationClient(config: NotificationClientConfig) {
  return createTRPCClient<NotificationRouter>({
    links: [
      httpLink({
        url: `${config.baseUrl.replace(/\/+$/, "")}/trpc`,
        methodOverride: "POST",
        headers: () => ({ Authorization: `Bearer ${config.internalApiKey}` }),
      }),
    ],
  });
}

export type NotificationClient = ReturnType<typeof createNotificationClient>;
