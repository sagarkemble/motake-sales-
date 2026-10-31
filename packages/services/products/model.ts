import { z } from "zod";

import { unitOfMeasureCodeSchema } from "../units-of-measure/model";

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
// The size is a number above 0 with up to 3 decimals, like 500 or 1.5, in a unit from Settings.
// The name leaves the size out and may be empty, so the Variety reads as its size alone.
export const varietySizeValueSchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,3})?$/, "Size is a number like 500 or 1.5")
  .refine((sizeValue) => Number(sizeValue) > 0, "Size must be more than 0");

export const createProductVarietyInputSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().trim().max(120),
  sizeValue: varietySizeValueSchema,
  uomCode: unitOfMeasureCodeSchema,
});
export type CreateProductVarietyInput = z.infer<typeof createProductVarietyInputSchema>;

// Size and unit change together.
export const updateProductVarietyInputSchema = createProductVarietyInputSchema
  .omit({ productId: true })
  .partial()
  .refine((changes) => (changes.sizeValue === undefined) === (changes.uomCode === undefined), {
    message: "sizeValue and uomCode change together",
    path: ["uomCode"],
  });
export type UpdateProductVarietyInput = z.infer<typeof updateProductVarietyInputSchema>;

export const listProductsInputSchema = z.object({
  searchTerm: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
  includeDeleted: z.boolean().optional().default(false),
});
export type ListProductsInput = z.infer<typeof listProductsInputSchema>;
