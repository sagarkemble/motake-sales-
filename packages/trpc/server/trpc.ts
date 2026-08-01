import { initTRPC, TRPCError } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";
import { createContext } from "./context";
import { getAuthentication } from "./utils/cookie";
import { unauthorized } from "./utils/error";
import { verifyToken } from "@repo/services/auth"

export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({});

export const router = tRPCContext.router;

export const publicProcedure = tRPCContext.procedure;

export const protectedProcedure = tRPCContext.procedure.use(
  async ({ ctx, next }) => {
    const token = getAuthentication(ctx);
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw unauthorized("Invalid or expired session");
    }

    if (!payload?.id) throw unauthorized("Invalid session payload");

    // Validate that the token was issued AFTER the user's most recent password
    // change. Lets `changePassword` invalidate sessions on other devices.
    // TODO: Implement user service and get user by id
    const user = { id: null };

    // if (!user) throw unauthorized("Session is no longer valid");
    // if (payload.iat !== undefined) {
    //   const pwdChangedAtSec = Math.floor(
    //     user.passwordChangedAt.getTime() / 1000,
    //   );
    //   if (payload.iat < pwdChangedAtSec) {
    //     throw unauthorized("Session was revoked. Please sign in again.");
    //   }
    // }

    return next({
      ctx: {
        ...ctx,
        user: {
          id: user.id,
        },
      },
    });
  },
);
