import { authService } from "../../services";
import { z, zodUndefinedModel } from "../../schema";
import { protectedProcedure, publicProcedure, router } from "../../trpc";
import { clearAuthentication, setAuthentication } from "../../utils/cookie";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { notFound } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import {
  createSessionInputSchema,
  sessionUserSchema,
  signedInUserSchema,
  updatedPhoneSchema,
} from "./model";

const path = generatePath("/auth");

export const authRouter = router({
  createSession: publicProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/session"),
        tags: ["Auth"],
        summary: "Create a session from a Supabase access token",
        description:
          "Check the Supabase access token. Save it in an httpOnly session cookie. Return the user id and role.",
      },
    })
    .input(createSessionInputSchema)
    .output(apiResponseSchema(sessionUserSchema))
    .mutation(async ({ ctx, input }) => {
      const authenticatedUser = await authService.verifyAccessToken(input.accessToken);
      setAuthentication(ctx, input.accessToken);
      return apiResponse({ id: authenticatedUser.id, role: authenticatedUser.role });
    }),

  logout: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/logout"),
        tags: ["Auth"],
        protect: true,
        summary: "End the current session",
        description: "Clear the session cookie. The user must sign in again to make new requests.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(z.object({ loggedOut: z.literal(true) })))
    .mutation(async ({ ctx }) => {
      clearAuthentication(ctx);
      return apiResponse({ loggedOut: true as const });
    }),

  me: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/me"),
        tags: ["Auth"],
        protect: true,
        summary: "Get the signed-in user",
        description: "Return the profile of the user tied to the current session.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(signedInUserSchema))
    .query(async ({ ctx }) => {
      const profile = await authService.getProfileById(ctx.user.id);
      if (!profile) throw notFound("Profile not found");
      return apiResponse({
        id: profile.id,
        role: profile.role,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      });
    }),

  confirmPhoneNumber: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/me/phone"),
        tags: ["Auth"],
        protect: true,
        summary: "Save a verified phone number",
        description:
          "Check the Supabase access token from a completed phone OTP verification. Save the verified phone number on the signed-in user's profile.",
      },
    })
    .input(createSessionInputSchema)
    .output(apiResponseSchema(updatedPhoneSchema))
    .mutation(async ({ ctx, input }) => {
      const updatedProfile = await authService.confirmPhoneNumber(input.accessToken, ctx.user.id);
      setAuthentication(ctx, input.accessToken);
      return apiResponse({ id: updatedProfile.id, phone: updatedProfile.phone });
    }),
});
