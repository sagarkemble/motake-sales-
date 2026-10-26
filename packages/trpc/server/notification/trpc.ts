import { createHash, timingSafeEqual } from "node:crypto";

import { refusalOf, unauthorized } from "@repo/services/errors";
import { initTRPC } from "@trpc/server";
import { ZodError } from "zod";

import type { NotificationTRPCContext } from "./context";

const BEARER_PREFIX = "Bearer ";

// Its own tRPC instance, separate from the app router's: no OpenAPI meta and no cookies.
export const notificationTRPC = initTRPC.context<NotificationTRPCContext>().create({
  errorFormatter({ shape, error }) {
    const zodError = error.cause instanceof ZodError ? error.cause : null;
    return {
      ...shape,
      message: zodError ? "Validation failed" : shape.message,
      data: {
        ...shape.data,
        stack: undefined,
        issues:
          zodError?.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })) ?? null,
        // Refused instructions: the machine reason (template_not_found, ...), as on the app router.
        refusal: refusalOf(error),
      },
    };
  },
});

export const router = notificationTRPC.router;

function keysMatch(given: string, expected: string): boolean {
  const givenDigest = createHash("sha256").update(given).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(givenDigest, expectedDigest) && given.length === expected.length;
}

// `Authorization: Bearer <NOTIFICATION_INTERNAL_API_KEY>`, compared in constant time.
export const internalProcedure = notificationTRPC.procedure.use(async ({ ctx, next }) => {
  const header = ctx.req.headers.authorization;
  const authorization = Array.isArray(header) ? header[0] : header;
  if (!ctx.internalApiKey || !authorization?.startsWith(BEARER_PREFIX)) throw unauthorized();
  if (!keysMatch(authorization.slice(BEARER_PREFIX.length), ctx.internalApiKey)) {
    throw unauthorized("Invalid internal API key");
  }
  return next({ ctx });
});
