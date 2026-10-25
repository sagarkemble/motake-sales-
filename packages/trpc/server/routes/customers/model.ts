import { z } from "../../schema";

export const customerSchema = z.object({
  id: z.string(),
  shopName: z.string(),
  contactName: z.string().nullable(),
  phone: z.string(),
  address: z.string(),
  notes: z.string().nullable(),
  shopPhotoKey: z.string().nullable(),
  shopPhotoUrl: z.string().nullable(),
  createdBy: z.string(),
  status: z.enum(["active", "inactive"]),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export const paginatedCustomersSchema = z.object({
  items: z.array(customerSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export const createCustomerInputSchema = z.object({
  shopName: z.string().min(1).max(200),
  contactName: z.string().max(120).optional(),
  phone: z.string().min(1).max(20),
  address: z.string().min(1),
  notes: z.string().optional(),
  shopPhotoKey: z.string().min(1),
});

export const updateCustomerInputSchema = z.object({
  shopName: z.string().min(1).max(200).optional(),
  contactName: z.string().max(120).optional(),
  phone: z.string().min(1).max(20).optional(),
  address: z.string().min(1).optional(),
  notes: z.string().optional(),
  shopPhotoKey: z.string().min(1).nullable().optional(),
});

export const customerIdInputSchema = z.object({ id: z.string().uuid() });

export const customerStatsSchema = z.object({
  totalOrderCount: z.number(),
  billedQuantity: z.number().int(),
  lifetimeValuePaise: z.number().int(),
  lastOrderAt: z.date().nullable(),
});

export const listCustomersInputSchema = z.object({
  searchTerm: z.string().optional(),
  includeInactive: z.boolean().optional().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});

export const openOrderSummarySchema = z.object({
  id: z.string(),
  type: z.enum(["book_now", "pre_order"]),
  status: z.enum(["confirmed", "scheduled", "due", "fulfilled", "cancelled"]),
  totalQuantity: z.number().int(),
  scheduledDate: z.string().nullable(),
  placedAt: z.date(),
});

export const createShopPhotoUploadUrlInputSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  contentLength: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});

export const createShopPhotoUploadUrlOutputSchema = z.object({
  uploadUrl: z.string(),
  imageKey: z.string(),
  imageUrl: z.string(),
});
