import { z } from "../../schema";

export const entityStatusSchema = z.enum(["active", "inactive"]);

export const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageKey: z.string().nullable(),
  imageUrl: z.string().nullable(),
  status: entityStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export const productVarietySchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  status: entityStatusSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export const productWithVarietiesSchema = z.object({
  product: productSchema,
  varieties: z.array(productVarietySchema),
});

export const paginatedProductsSchema = z.object({
  items: z.array(productWithVarietiesSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export const createProductInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  imageKey: z.string().optional(),
  imageUrl: z.string().optional(),
});

export const updateProductInputSchema = createProductInputSchema.partial();

export const productIdInputSchema = z.object({ id: z.string().uuid() });

export const listProductsInputSchema = z.object({
  searchTerm: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  includeDeleted: z.boolean().optional().default(false),
});

export const createProductVarietyInputSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(32),
});

export const updateProductVarietyInputSchema = createProductVarietyInputSchema
  .omit({ productId: true })
  .partial();

export const varietyIdInputSchema = z.object({ id: z.string().uuid() });

export const productVarietiesInputSchema = z.object({
  productId: z.string().uuid(),
  // Admin only: also return deactivated varieties so they can be reactivated.
  includeInactive: z.boolean().optional().default(false),
});

export const allowedProductImageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export const createImageUploadUrlInputSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(allowedProductImageContentTypes),
});

export const createImageUploadUrlOutputSchema = z.object({
  uploadUrl: z.string(),
  imageKey: z.string(),
  imageUrl: z.string(),
});

// Variety tax periods (Admin only). The rate crosses the API as integer basis points; 5% is 500.
export const varietyTaxPeriodSchema = z.object({
  id: z.string(),
  varietyId: z.string(),
  effectiveFrom: z.string(),
  hsn: z.string(),
  exempt: z.boolean(),
  gstRateBps: z.number(),
  createdAt: z.date(),
});

export const taxFactsSchema = z.object({
  periodId: z.string(),
  effectiveFrom: z.string(),
  hsn: z.string(),
  exempt: z.boolean(),
  gstRateBps: z.number(),
});

export const taxPeriodListSchema = z.object({
  today: z.string(),
  currentFinancialYear: z.object({
    financialYear: z.string(),
    firstDay: z.string(),
    lastDay: z.string(),
  }),
  periods: z.array(
    varietyTaxPeriodSchema.extend({
      coversToday: z.boolean(),
      upcoming: z.boolean(),
      editable: z.boolean(),
    }),
  ),
});

export const listTaxPeriodsInputSchema = z.object({ varietyId: z.string().uuid() });

export const currentTaxForVarietiesInputSchema = z.object({
  varietyIds: z.array(z.string().uuid()).max(500),
});

export const currentTaxSchema = z.object({
  varietyId: z.string(),
  period: taxFactsSchema.nullable(),
});

export const upsertTaxPeriodInputSchema = z.object({
  varietyId: z.string().uuid(),
  effectiveFrom: z.iso.date(),
  hsn: z.string().regex(/^[0-9]{4,8}$/, "HSN must be 4 to 8 digits"),
  exempt: z.boolean(),
  gstRateBps: z.number().int().min(0),
});

export const upsertTaxPeriodOutputSchema = z.object({
  period: varietyTaxPeriodSchema,
  outcome: z.enum(["created", "overwritten"]),
});

export const deleteTaxPeriodOutputSchema = z.object({
  deleted: varietyTaxPeriodSchema,
  coveringToday: taxFactsSchema.nullable(),
});
