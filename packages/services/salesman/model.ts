import { z } from "zod";

export const createSalesmanInputSchema = z.object({
  id: z.uuid(),
  salesmanCode: z.string().min(1).max(32),
});
export type CreateSalesmanInput = z.infer<typeof createSalesmanInputSchema>;

export const updateSalesmanCodeInputSchema = z.object({
  salesmanCode: z.string().min(1).max(32),
});
export type UpdateSalesmanCodeInput = z.infer<typeof updateSalesmanCodeInputSchema>;

export const updateSalesmanProfileInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  avatarKey: z.string().optional(),
  avatarUrl: z.string().optional(),
});
export type UpdateSalesmanProfileInput = z.infer<typeof updateSalesmanProfileInputSchema>;

export const allowedAvatarImageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export const createAvatarUploadUrlInputSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(allowedAvatarImageContentTypes),
});
export type CreateAvatarUploadUrlInput = z.infer<typeof createAvatarUploadUrlInputSchema>;

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
