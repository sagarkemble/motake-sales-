import { initTRPC, TRPCError } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";
import { createContext } from "./context";

export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({});

export const router = tRPCContext.router;

export const publicProcedure = tRPCContext.procedure;
export const privateProcedure = tRPCContext.procedure.use(async ({ ctx, next }) => {

  return next({
    ctx: {
      ...ctx,
      user: {
        id: "some-user-id"
      }
    }
  })
})