import { z } from "zod";

export const createProductInputSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  imageKey: z.string().optional(),
  imageUrl: z.string().optional(),
});
export type CreateProductInput = z.infer<typeof createProductInputSchema>;

export const updateProductInputSchema = createProductInputSchema.partial();
export type UpdateProductInput = z.infer<typeof updateProductInputSchema>;

export const createProductVarietyInputSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(32),
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
});
export type ListProductsInput = z.infer<typeof listProductsInputSchema>;
