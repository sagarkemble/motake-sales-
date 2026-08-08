import { authService } from "../../services";
import { z, zodUndefinedModel } from "../../schema";
import { protectedProcedure, publicProcedure, router } from "../../trpc";
import { clearAuthentication, setAuthentication } from "../../utils/cookie";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { notFound } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import {
  createAvatarUploadUrlInputSchema,
  createAvatarUploadUrlOutputSchema,
  createSessionInputSchema,
  sessionUserSchema,
  signedInUserSchema,
  updateMyProfileInputSchema,
  updatedPhoneSchema,
} from "./model";

const path = generatePath("/auth");

function toSignedInUser(profile: {
  id: string;
  role: "admin" | "salesman";
  name: string | null;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  status: "active" | "inactive";
}) {
  return {
    id: profile.id,
    role: profile.role,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    avatarUrl: profile.avatarUrl,
    status: profile.status,
  };
}

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
      return apiResponse(toSignedInUser(profile));
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

  updateMyProfile: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/me"),
        tags: ["Auth"],
        protect: true,
        summary: "Update my profile",
        description: "Change the name or avatar of the signed-in user.",
      },
    })
    .input(updateMyProfileInputSchema)
    .output(apiResponseSchema(signedInUserSchema))
    .mutation(async ({ ctx, input }) => {
      const profile = await authService.updateMyProfile(ctx.user.id, input);
      if (!profile) throw notFound("Profile not found");
      return apiResponse(toSignedInUser(profile));
    }),

  createAvatarUploadUrl: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/me/avatar-upload-url"),
        tags: ["Auth"],
        protect: true,
        summary: "Get my avatar upload URL",
        description:
          "Return a short-lived URL the browser can upload the signed-in user's avatar image to directly.",
      },
    })
    .input(createAvatarUploadUrlInputSchema)
    .output(apiResponseSchema(createAvatarUploadUrlOutputSchema))
    .mutation(async ({ ctx, input }) => {
      const result = await authService.createAvatarUploadUrl(ctx.user.id, input);
      return apiResponse(result);
    }),

  deleteMyAvatar: protectedProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/me/avatar"),
        tags: ["Auth"],
        protect: true,
        summary: "Delete my avatar",
        description: "Remove the signed-in user's avatar image and clear it from their profile.",
      },
    })
    .input(zodUndefinedModel)
    .output(apiResponseSchema(signedInUserSchema))
    .mutation(async ({ ctx }) => {
      const profile = await authService.deleteMyAvatar(ctx.user.id);
      if (!profile) throw notFound("Profile not found");
      return apiResponse(toSignedInUser(profile));
    }),
});
