import { z } from "../../schema";

export const salesmanSchema = z.object({
  id: z.string(),
  salesmanCode: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const profileSchema = z.object({
  id: z.string(),
  role: z.enum(["admin", "salesman"]),
  email: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  status: z.enum(["active", "inactive"]),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export const salesmanWithProfileSchema = z.object({
  salesman: salesmanSchema,
  profile: profileSchema,
});

export const paginatedSalesmenSchema = z.object({
  items: z.array(salesmanWithProfileSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export const createSalesmanAccountInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
  phone: z.string().min(1).max(20),
  salesmanCode: z.string().min(1).max(32),
});

export const salesmanIdInputSchema = z.object({ id: z.string().uuid() });

export const updateSalesmanAccountInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(1).max(20).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
});

export const listSalesmenInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  includeDeleted: z.boolean().optional().default(false),
});

export const salesmanHistoryInputSchema = z.object({
  id: z.string().uuid(),
  from: z.string(),
  to: z.string(),
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

export const salesmanDayWiseHistoryRowSchema = z.object({
  businessDate: z.string(),
  gatepassStatus: z.enum(["not_issued", "active", "pending_verification", "closed"]).nullable(),
  allottedQty: z.number(),
  soldQty: z.number(),
  returnedQty: z.number(),
  preOrderedQty: z.number(),
});
