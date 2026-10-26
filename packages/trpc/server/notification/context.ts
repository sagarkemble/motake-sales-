import type NotificationService from "@repo/services/notification";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";

// Request headers only: no cookies and no Supabase user. The notification router is called by the
// main API with the shared internal API key (ADR-0001).
export interface NotificationTRPCRequest {
  headers: Record<string, string | string[] | undefined>;
}

export interface NotificationTRPCContext {
  req: NotificationTRPCRequest;
  notificationService: NotificationService;
  // NOTIFICATION_INTERNAL_API_KEY; not the app JWT secret and not the Supabase service-role key.
  internalApiKey: string;
}

export interface NotificationContextDependencies {
  notificationService: NotificationService;
  internalApiKey: string;
}

// `apps/notification` builds the service (provider, R2 reader, Inngest dispatcher) and hands it in.
export function createNotificationContextFactory(dependencies: NotificationContextDependencies) {
  return async function createNotificationContext({
    req,
  }: CreateExpressContextOptions): Promise<NotificationTRPCContext> {
    return {
      req: { headers: req.headers as Record<string, string | string[] | undefined> },
      notificationService: dependencies.notificationService,
      internalApiKey: dependencies.internalApiKey,
    };
  };
}
