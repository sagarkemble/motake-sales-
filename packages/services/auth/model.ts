import { z } from "zod";

export const appRoleSchema = z.enum(["admin", "salesman"]);
export type AppRole = z.infer<typeof appRoleSchema>;

export interface AuthenticatedUser {
  id: string;
  email: string;
  phone?: string;
  phoneConfirmedAt?: string;
  role: AppRole;
}

export const createSalesmanAccountInputSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
  phone: z.string().min(1).max(20),
  avatarKey: z.string().min(1).optional(),
});
export type CreateSalesmanAccountInput = z.infer<typeof createSalesmanAccountInputSchema>;

export const updateSalesmanAccountInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(1).max(20).optional(),
  email: z.email().optional(),
  password: z.string().min(8).optional(),
  // null removes the photo.
  avatarKey: z.string().min(1).nullable().optional(),
});
export type UpdateSalesmanAccountInput = z.infer<typeof updateSalesmanAccountInputSchema>;

export {
  updateProfileNameAndAvatarInputSchema as updateMyProfileInputSchema,
  createProfileAvatarUploadUrlInputSchema as createAvatarUploadUrlInputSchema,
  allowedAvatarImageContentTypes,
  maxAvatarImageContentLengthBytes,
  type UpdateProfileNameAndAvatarInput as UpdateMyProfileInput,
  type CreateProfileAvatarUploadUrlInput as CreateAvatarUploadUrlInput,
} from "../shared/profile-avatar";
