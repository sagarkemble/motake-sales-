import {
  createProduct,
  createProductVariety,
  getProductById,
  getProductVarietyBySku,
  hardArchiveProduct,
  listActiveProductsWithVarieties,
  listProductsForAdminWithVarieties,
  listVarietiesByProductId,
  reactivateProduct,
  softDeleteProductVariety,
  updateProduct,
  updateProductVariety,
  type ProductWithVarieties,
} from "@repo/database/queries/products";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { SelectProduct, SelectProductVariety } from "@repo/database/schema";

import { conflict, notFound } from "../errors";
import { buildObjectKey, buildPublicUrl, createPresignedUploadUrl } from "../uploads/r2-client";
import {
  createImageUploadUrlInputSchema,
  createProductInputSchema,
  createProductVarietyInputSchema,
  listProductsInputSchema,
  updateProductInputSchema,
  updateProductVarietyInputSchema,
  type CreateImageUploadUrlInput,
  type CreateProductInput,
  type CreateProductVarietyInput,
  type ListProductsInput,
  type UpdateProductInput,
  type UpdateProductVarietyInput,
} from "./model";

const productImageFolderName = "products";

interface ImageUploadUrlResult {
  uploadUrl: string;
  imageKey: string;
  imageUrl: string;
}

class ProductService {
  public async createProduct(input: CreateProductInput): Promise<SelectProduct> {
    const parsedInput = createProductInputSchema.parse(input);
    return createProduct(parsedInput);
  }

  public async getProductById(productId: string): Promise<SelectProduct | undefined> {
    return getProductById(productId);
  }

  public async updateProduct(
    productId: string,
    changes: UpdateProductInput,
  ): Promise<SelectProduct | undefined> {
    const parsedChanges = updateProductInputSchema.parse(changes);
    return updateProduct(productId, parsedChanges);
  }

  public async deactivateProduct(productId: string): Promise<SelectProduct | undefined> {
    return updateProduct(productId, { status: "inactive" });
  }

  public async reactivateProduct(productId: string): Promise<SelectProduct | undefined> {
    return reactivateProduct(productId);
  }

  public async deleteProduct(productId: string): Promise<SelectProduct | undefined> {
    await updateProduct(productId, { status: "inactive" });
    return hardArchiveProduct(productId);
  }

  public async listProducts(input: ListProductsInput): Promise<PaginatedResult<ProductWithVarieties>> {
    const parsedInput = listProductsInputSchema.parse(input);
    return listActiveProductsWithVarieties(
      { page: parsedInput.page, pageSize: parsedInput.pageSize },
      parsedInput.searchTerm,
    );
  }

  public async listProductsForAdmin(input: ListProductsInput): Promise<PaginatedResult<ProductWithVarieties>> {
    const parsedInput = listProductsInputSchema.parse(input);
    return listProductsForAdminWithVarieties(
      { page: parsedInput.page, pageSize: parsedInput.pageSize },
      parsedInput.searchTerm,
      parsedInput.includeDeleted,
    );
  }

  public async createProductVariety(input: CreateProductVarietyInput): Promise<SelectProductVariety> {
    const parsedInput = createProductVarietyInputSchema.parse(input);
    const parentProduct = await getProductById(parsedInput.productId);
    if (!parentProduct) {
      throw notFound(`Cannot create variety, product ${parsedInput.productId} not found`);
    }
    const varietyWithSameSku = await getProductVarietyBySku(parsedInput.sku);
    if (varietyWithSameSku) {
      throw conflict(`SKU "${parsedInput.sku}" is already in use by another variety`);
    }
    return createProductVariety(parsedInput);
  }

  public async listVarietiesForProduct(productId: string): Promise<SelectProductVariety[]> {
    return listVarietiesByProductId(productId);
  }

  public async updateProductVariety(
    varietyId: string,
    changes: UpdateProductVarietyInput,
  ): Promise<SelectProductVariety | undefined> {
    const parsedChanges = updateProductVarietyInputSchema.parse(changes);
    if (parsedChanges.sku) {
      const varietyWithSameSku = await getProductVarietyBySku(parsedChanges.sku);
      if (varietyWithSameSku && varietyWithSameSku.id !== varietyId) {
        throw conflict(`SKU "${parsedChanges.sku}" is already in use by another variety`);
      }
    }
    return updateProductVariety(varietyId, parsedChanges);
  }

  public async deactivateProductVariety(varietyId: string): Promise<SelectProductVariety | undefined> {
    return softDeleteProductVariety(varietyId);
  }

  public async createImageUploadUrl(input: CreateImageUploadUrlInput): Promise<ImageUploadUrlResult> {
    const parsedInput = createImageUploadUrlInputSchema.parse(input);
    const imageKey = buildObjectKey(productImageFolderName, parsedInput.fileName);
    const uploadUrl = await createPresignedUploadUrl(imageKey, parsedInput.contentType);
    return { uploadUrl, imageKey, imageUrl: buildPublicUrl(imageKey) };
  }
}

export default ProductService;
