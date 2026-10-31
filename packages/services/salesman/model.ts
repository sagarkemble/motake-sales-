import { z } from "zod";

// The Salesman code is generated from the name and phone; Admin never types it.
export const createSalesmanInputSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(120),
  phone: z.string().min(1).max(20),
});
export type CreateSalesmanInput = z.infer<typeof createSalesmanInputSchema>;

export {
  updateProfileNameAndAvatarInputSchema as updateSalesmanProfileInputSchema,
  createProfileAvatarUploadUrlInputSchema as createAvatarUploadUrlInputSchema,
  allowedAvatarImageContentTypes,
  maxAvatarImageContentLengthBytes,
  type UpdateProfileNameAndAvatarInput as UpdateSalesmanProfileInput,
  type CreateProfileAvatarUploadUrlInput as CreateAvatarUploadUrlInput,
} from "../shared/profile-avatar";

export const listSalesmenInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  includeDeleted: z.boolean().optional().default(false),
});
export type ListSalesmenInput = z.infer<typeof listSalesmenInputSchema>;

export const salesmanHistoryRangeInputSchema = z.object({
  from: z.string(),
  to: z.string(),
});
export type SalesmanHistoryRangeInput = z.infer<typeof salesmanHistoryRangeInputSchema>;
