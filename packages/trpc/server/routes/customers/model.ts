import { z } from "../../schema";

export const preferredLanguageSchema = z.enum(["mr", "en"]);

// Empty = no GSTIN; otherwise 15 letters or digits (checked again by the service).
const gstinInputSchema = z.string().max(20).nullable();

export const customerSchema = z.object({
  id: z.string(),
  shopName: z.string(),
  contactName: z.string().nullable(),
  phone: z.string(),
  address: z.string(),
  notes: z.string().nullable(),
  shopPhotoKey: z.string().nullable(),
  shopPhotoUrl: z.string().nullable(),
  routeId: z.string(),
  gstin: z.string().nullable(),
  // Fixed once the Customer is added.
  preferredLanguage: preferredLanguageSchema,
  createdBy: z.string(),
  status: z.enum(["active", "inactive"]),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

// Reads carry the live Route; a hidden Route is still shown, labelled. Balance: positive is
// Pending (owes Motake), negative is Advance; field Payment shows what clears Pending from it.
export const customerWithRouteSchema = customerSchema.extend({
  routeName: z.string(),
  routeCode: z.string(),
  routeHidden: z.boolean(),
  balancePaise: z.number().int(),
});

export const paginatedCustomersSchema = z.object({
  items: z.array(customerWithRouteSchema),
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
  shopPhotoKey: z.string().min(1).optional(),
  preferredLanguage: preferredLanguageSchema.optional(),
  // Admin only, and required for Admin. A salesman's Customer goes on their Active GatePass Route.
  routeId: z.string().uuid().optional(),
  // Admin only; the salesman form does not ask for it.
  gstin: gstinInputSchema.optional(),
});

export const updateCustomerInputSchema = z.object({
  shopName: z.string().min(1).max(200).optional(),
  contactName: z.string().max(120).optional(),
  phone: z.string().min(1).max(20).optional(),
  address: z.string().min(1).optional(),
  notes: z.string().optional(),
  shopPhotoKey: z.string().min(1).nullable().optional(),
  gstin: gstinInputSchema.optional(),
});

export const customerIdInputSchema = z.object({ id: z.string().uuid() });

export const customerStatsSchema = z.object({
  totalOrderCount: z.number(),
  billedQuantity: z.number().int(),
  lifetimeValuePaise: z.number().int(),
  lastOrderAt: z.date().nullable(),
});

export const moveCustomerRouteInputSchema = z.object({
  id: z.string().uuid(),
  toRouteId: z.string().uuid(),
});

export const listCustomersInputSchema = z.object({
  searchTerm: z.string().optional(),
  // Admin only; a salesman always sees their Active GatePass Route.
  routeId: z.string().uuid().optional(),
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
