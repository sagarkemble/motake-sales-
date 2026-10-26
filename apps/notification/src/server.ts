import express from "express";
import { logger } from "@repo/logger";

import * as trpcExpress from "@trpc/server/adapters/express";
import { serve } from "inngest/express";
import {
  createNotificationContextFactory,
  notificationRouter,
} from "@repo/trpc/server/notification";
import { env } from "./env";
import { createNotificationFunctions, emitStatusEvents, inngest } from "./inngest";
import { notificationService } from "./notification-service";

// The only path Caddy forwards here from outside; tRPC and Inngest stay on localhost.
export const WHATSAPP_WEBHOOK_PATH = "/webhooks/whatsapp";

// WhatsApp webhook bodies are small; anything bigger is not Meta.
const WEBHOOK_BODY_LIMIT = "1mb";

export const app = express();

app.get("/", (req, res) => {
  return res.json({ message: "notification service up and running..." });
});

app.get("/health", async (req, res) => {
  const health = await notificationService.health();
  return res.status(health.status === "ok" ? 200 : 503).json(health);
});

// Meta's subscribe check: echo the challenge only when the verify token matches.
app.get(WHATSAPP_WEBHOOK_PATH, (req, res) => {
  const challenge = notificationService.verifyWebhookSubscription({
    mode: typeof req.query["hub.mode"] === "string" ? req.query["hub.mode"] : undefined,
    verifyToken:
      typeof req.query["hub.verify_token"] === "string" ? req.query["hub.verify_token"] : undefined,
    challenge:
      typeof req.query["hub.challenge"] === "string" ? req.query["hub.challenge"] : undefined,
  });
  if (challenge === null) return res.sendStatus(403);
  return res.type("text/plain").send(challenge);
});

// Raw body: the signature is checked over the exact bytes before any JSON parsing. Statuses are
// handed to Inngest and applied in the background, so Meta gets its 200 quickly.
app.post(
  WHATSAPP_WEBHOOK_PATH,
  express.raw({ type: "*/*", limit: WEBHOOK_BODY_LIMIT }),
  async (req, res) => {
    const rawBody: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const result = notificationService.handleWebhookPost(
      rawBody,
      req.header("x-hub-signature-256"),
    );
    if (!result.accepted) return res.sendStatus(401);
    try {
      await emitStatusEvents(result.statuses);
    } catch (error) {
      // Meta redelivers on a non-200, and the event ids dedupe what did get through.
      logger.error("Could not queue WhatsApp statuses", {
        error: error instanceof Error ? error.message : String(error),
      });
      return res.sendStatus(500);
    }
    logger.debug("WhatsApp webhook", { body: rawBody.toString("utf8") });
    return res.sendStatus(200);
  },
);

app.use(
  "/api/inngest",
  express.json({ limit: "10mb" }),
  serve({ client: inngest, functions: createNotificationFunctions(notificationService) }),
);

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: notificationRouter,
    createContext: createNotificationContextFactory({
      notificationService,
      internalApiKey: env.NOTIFICATION_INTERNAL_API_KEY,
    }),
    // The typed client sends queries as POST so long businessRef lists fit.
    allowMethodOverride: true,
    onError({ error, path }) {
      logger.error(`tRPC error on ${path ?? "unknown path"}`, {
        message: error.message,
        code: error.code,
        cause: error.cause,
      });
    },
  }),
);

export default app;
