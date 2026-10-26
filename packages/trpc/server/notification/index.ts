import { notificationRouter } from "../routes/notification/route";

// Separate from serverRouter: mounted only on apps/notification, never added to serverRouter and
// never reachable from apps/web (ADR-0001).
export { notificationRouter };
export { createNotificationContextFactory, type NotificationTRPCContext } from "./context";
export {
  createNotificationClient,
  type NotificationClient,
  type NotificationClientConfig,
} from "./client";
export type NotificationRouter = typeof notificationRouter;
