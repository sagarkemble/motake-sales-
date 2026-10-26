import { initTRPC } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";
import { ZodError } from "zod";

import { createContext } from "./context";
import { authService, salesmanService } from "./services";
import { getAuthentication } from "./utils/cookie";
import { forbidden, refusalOf, unauthorized } from "@repo/services/errors";

export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({
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
          // Refused calls: machine-readable reason and details for the app to branch on.
          refusal: refusalOf(error),
        },
      };
    },
  });

export const router = tRPCContext.router;

export const publicProcedure = tRPCContext.procedure;

export const protectedProcedure = tRPCContext.procedure.use(async ({ ctx, next }) => {
  const accessToken = getAuthentication(ctx);
  if (!accessToken) throw unauthorized();

  let authenticatedUser;
  try {
    authenticatedUser = await authService.verifyAccessToken(accessToken);
  } catch {
    throw unauthorized("Invalid or expired session");
  }

  return next({
    ctx: {
      ...ctx,
      user: {
        id: authenticatedUser.id,
        role: authenticatedUser.role,
      },
    },
  });
});

export const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user?.role !== "admin") throw forbidden();
  return next({ ctx });
});

// A deactivated salesman can still read but cannot write.
async function assertSalesmanActive(salesmanId: string): Promise<void> {
  const salesmanWithProfile = await salesmanService.getSalesmanWithProfile(salesmanId);
  if (salesmanWithProfile?.profile.status === "inactive") {
    throw forbidden("Account is deactivated. Contact admin.");
  }
}

export const salesmanProcedure = protectedProcedure.use(async ({ ctx, next, type }) => {
  if (ctx.user?.role !== "salesman") throw forbidden();

  if (type === "mutation" && ctx.user?.id) await assertSalesmanActive(ctx.user.id);

  return next({ ctx });
});

// Admin and salesman (the only two roles); a salesman's mutations get the same
// deactivated-account check as salesmanProcedure.
export const adminOrSalesmanProcedure = protectedProcedure.use(async ({ ctx, next, type }) => {
  if (type === "mutation" && ctx.user.role === "salesman") await assertSalesmanActive(ctx.user.id);

  return next({ ctx });
});
