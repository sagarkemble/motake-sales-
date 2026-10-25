import { z } from "zod";

export const allowedShopPhotoContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxShopPhotoContentLengthBytes = 5 * 1024 * 1024;

export const createCustomerInputSchema = z.object({
  shopName: z.string().min(1).max(200),
  contactName: z.string().max(120).optional(),
  phone: z.string().min(1).max(20),
  address: z.string().min(1),
  notes: z.string().optional(),
  shopPhotoKey: z.string().min(1),
  createdBy: z.string().uuid(),
});
export type CreateCustomerInput = z.infer<typeof createCustomerInputSchema>;

export const updateCustomerInputSchema = z.object({
  shopName: z.string().min(1).max(200).optional(),
  contactName: z.string().max(120).optional(),
  phone: z.string().min(1).max(20).optional(),
  address: z.string().min(1).optional(),
  notes: z.string().optional(),
  shopPhotoKey: z.string().min(1).nullable().optional(),
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerInputSchema>;

export const listCustomersInputSchema = z.object({
  searchTerm: z.string().optional(),
  includeInactive: z.boolean().optional().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
export type ListCustomersInput = z.input<typeof listCustomersInputSchema>;

export const createShopPhotoUploadUrlInputSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(allowedShopPhotoContentTypes),
  contentLength: z.number().int().positive().max(maxShopPhotoContentLengthBytes),
});
export type CreateShopPhotoUploadUrlInput = z.infer<typeof createShopPhotoUploadUrlInputSchema>;
