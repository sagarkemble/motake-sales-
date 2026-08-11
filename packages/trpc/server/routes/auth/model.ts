import { z } from "../../schema";

export const appRoleSchema = z.enum(["admin", "salesman"]);

export const createSessionInputSchema = z.object({
  accessToken: z.string().min(1),
});

export const loginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const sessionUserSchema = z.object({
  id: z.string(),
  role: appRoleSchema,
});

export const signedInUserSchema = z.object({
  id: z.string(),
  role: appRoleSchema,
  name: z.string().nullable(),
  email: z.string(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
});

export const updatedPhoneSchema = z.object({
  id: z.string(),
  phone: z.string().nullable(),
});

export const updateMyProfileInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarKey: z.string().optional(),
});

export const allowedAvatarImageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxAvatarImageContentLengthBytes = 5 * 1024 * 1024;

export const createAvatarUploadUrlInputSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(allowedAvatarImageContentTypes),
  contentLength: z.number().int().positive().max(maxAvatarImageContentLengthBytes),
});

export const createAvatarUploadUrlOutputSchema = z.object({
  uploadUrl: z.string(),
  imageKey: z.string(),
  imageUrl: z.string(),
});
