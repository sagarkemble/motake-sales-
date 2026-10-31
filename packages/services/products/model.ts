import { z } from "zod";

// A Product always has an image: create needs one, and an update may replace it but never clear it.
export const createProductInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  imageKey: z.string().trim().min(1),
  imageUrl: z.string().trim().min(1),
});
export type CreateProductInput = z.infer<typeof createProductInputSchema>;

export const updateProductInputSchema = createProductInputSchema
  .partial()
  .refine((changes) => (changes.imageKey === undefined) === (changes.imageUrl === undefined), {
    message: "imageKey and imageUrl change together",
    path: ["imageUrl"],
  });
export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;

export const allowedProductImageContentTypes = ["image/jpeg", "image/png", "image/webp"] as const;

export const createImageUploadUrlInputSchema = z.object({
  fileName: z.string().min(1).max(200),
  contentType: z.enum(allowedProductImageContentTypes),
});
export type CreateImageUploadUrlInput = z.infer<typeof createImageUploadUrlInputSchema>;

// No price (Route prices replace it) and no SKU (the server mints it).
export const createProductVarietyInputSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(32),
});
export type CreateProductVarietyInput = z.infer<typeof createProductVarietyInputSchema>;

export const updateProductVarietyInputSchema = createProductVarietyInputSchema
  .omit({ productId: true })
  .partial();
export type UpdateProductVarietyInput = z.infer<typeof updateProductVarietyInputSchema>;

export const listProductsInputSchema = z.object({
  searchTerm: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  includeDeleted: z.boolean().optional().default(false),
});
export type ListProductsInput = z.infer<typeof listProductsInputSchema>;
