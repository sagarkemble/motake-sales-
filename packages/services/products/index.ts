import {
  createProduct,
  createProductVariety,
  getProductById,
  listActiveProductsWithVarieties,
  listVarietiesByProductId,
  softDeleteProduct,
  softDeleteProductVariety,
  updateProduct,
  updateProductVariety,
  type ProductWithVarieties,
} from "@repo/database/queries/products";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import type { SelectProduct, SelectProductVariety } from "@repo/database/schema";

import {
  createProductInputSchema,
  createProductVarietyInputSchema,
  listProductsInputSchema,
  updateProductInputSchema,
  updateProductVarietyInputSchema,
  type CreateProductInput,
  type CreateProductVarietyInput,
  type ListProductsInput,
  type UpdateProductInput,
  type UpdateProductVarietyInput,
} from "./model";

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
    return softDeleteProduct(productId);
  }

  public async listProducts(input: ListProductsInput): Promise<PaginatedResult<ProductWithVarieties>> {
    const parsedInput = listProductsInputSchema.parse(input);
    return listActiveProductsWithVarieties(
      { page: parsedInput.page, pageSize: parsedInput.pageSize },
      parsedInput.searchTerm,
    );
  }

  public async createProductVariety(input: CreateProductVarietyInput): Promise<SelectProductVariety> {
    const parsedInput = createProductVarietyInputSchema.parse(input);
    const parentProduct = await getProductById(parsedInput.productId);
    if (!parentProduct) {
      throw new Error(`Cannot create variety, product ${parsedInput.productId} not found`);
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
    return updateProductVariety(varietyId, parsedChanges);
  }

  public async deactivateProductVariety(varietyId: string): Promise<SelectProductVariety | undefined> {
    return softDeleteProductVariety(varietyId);
  }
}

export default ProductService;
