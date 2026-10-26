import { notificationRouter } from "../routes/notification/route";

// Separate from serverRouter: mounted only on apps/notification, never added to serverRouter and
// never reachable from apps/web (ADR-0001).
export { notificationRouter };
export { createNotificationContextFactory, type NotificationTRPCContext } from "./context";
// The typed client is not re-exported here: the main API imports it from
// `@repo/trpc/server/notification/client`, which loads no service, S3 or Meta code.
export type NotificationRouter = typeof notificationRouter;
