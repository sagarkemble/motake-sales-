import { z } from "zod";

export const allowedShopPhotoContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export const maxShopPhotoContentLengthBytes = 5 * 1024 * 1024;

export const preferredLanguageSchema = z.enum(["mr", "en"]);

// Trimmed and upper-cased; empty means no GSTIN. Otherwise exactly 15 letters or digits.
export const gstinSchema = z
  .string()
  .nullable()
  .transform((gstin) => gstin?.trim().toUpperCase() || null)
  .pipe(
    z
      .string()
      .regex(/^[A-Z0-9]{15}$/, "GSTIN must be exactly 15 letters or digits")
      .nullable(),
  );

const customerDetailsSchema = z.object({
  shopName: z.string().min(1).max(200),
  contactName: z.string().max(120).optional(),
  phone: z.string().min(1).max(20),
  address: z.string().min(1),
  notes: z.string().optional(),
  shopPhotoKey: z.string().min(1),
  // Fixed once the Customer is added.
  preferredLanguage: preferredLanguageSchema.default("mr"),
});

export const createCustomerAsAdminInputSchema = customerDetailsSchema.extend({
  routeId: z.string().uuid(),
  gstin: gstinSchema.optional(),
});
export type CreateCustomerAsAdminInput = z.input<typeof createCustomerAsAdminInputSchema>;

// The Route comes from the salesman's Active GatePass; Admin adds a GSTIN later if needed.
export const createCustomerAsSalesmanInputSchema = customerDetailsSchema;
export type CreateCustomerAsSalesmanInput = z.input<typeof createCustomerAsSalesmanInputSchema>;

export const updateCustomerInputSchema = z.object({
  shopName: z.string().min(1).max(200).optional(),
  contactName: z.string().max(120).optional(),
  phone: z.string().min(1).max(20).optional(),
  address: z.string().min(1).optional(),
  notes: z.string().optional(),
  shopPhotoKey: z.string().min(1).nullable().optional(),
  gstin: gstinSchema.optional(),
});
// No routeId (Move to Route is separate) and no preferredLanguage (fixed at add).
export type UpdateCustomerInput = z.input<typeof updateCustomerInputSchema>;

export const listCustomersInputSchema = z.object({
  searchTerm: z.string().optional(),
  routeId: z.string().uuid().optional(),
  includeInactive: z.boolean().optional().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
export type ListCustomersInput = z.input<typeof listCustomersInputSchema>;

export const listCustomersForSalesmanInputSchema = listCustomersInputSchema.omit({
  routeId: true,
  includeInactive: true,
});
export type ListCustomersForSalesmanInput = z.input<typeof listCustomersForSalesmanInputSchema>;

export const moveCustomerToRouteInputSchema = z.object({
  customerId: z.string().uuid(),
  toRouteId: z.string().uuid(),
});

export const createShopPhotoUploadUrlInputSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(allowedShopPhotoContentTypes),
  contentLength: z.number().int().positive().max(maxShopPhotoContentLengthBytes),
});
export type CreateShopPhotoUploadUrlInput = z.infer<typeof createShopPhotoUploadUrlInputSchema>;
