import {
  createProduct,
  createProductVariety,
  getProductById,
  getProductVarietyById,
  listVarietySkusWithPrefix,
  hardArchiveProduct,
  listActiveProductsWithVarieties,
  listProductsForAdminWithVarieties,
  listVarietiesByProductId,
  reactivateProduct,
  reactivateProductVariety,
  softDeleteProductVariety,
  updateProduct,
  updateProductVariety,
  type ProductWithVarieties,
} from "@repo/database/queries/products";
import type { PaginatedResult } from "@repo/database/queries/shared/pagination";
import { runInTransaction, type DbExecutor } from "@repo/database/queries/shared/executor";
import { violatedUniqueConstraint } from "@repo/database/queries/shared/pg-errors";
import type { SelectProduct, SelectProductVariety } from "@repo/database/schema";

import { badRequest, conflict, notFound, screenRefusal } from "../errors";
import UnitOfMeasureService from "../units-of-measure";
import { changedFields, createdFields, recordAudit } from "../shared/audit";
import {
  buildObjectKey,
  createClientUpload,
  deleteObject,
  type ImageUploadFormFields,
} from "../uploads/imagekit-client";
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
import { varietyDisplayName } from "./display-name";
import { nextVarietySku, varietySkuPrefix, varietySkuSlug } from "./sku";

const productImageFolderName = "products";
const varietyNameConstraint = "product_varieties_product_display_name_unique";
const varietySkuConstraint = "product_varieties_sku_unique";
const productAuditedFields = ["name", "description", "imageKey", "status"] as const;

function duplicateVarietyName(productName: string, varietyName: string) {
  return screenRefusal(
    "variety_name_taken",
    `Product "${productName}" already has a variety named "${varietyName}"`,
    { product: productName, variety: varietyName },
  );
}

interface ImageUploadUrlResult {
  uploadUrl: string;
  imageKey: string;
  imageUrl: string;
  formFields: ImageUploadFormFields;
}

class ProductService {
  private readonly unitOfMeasureService = new UnitOfMeasureService();

  public async createProduct(
    input: CreateProductInput,
    actorProfileId: string,
  ): Promise<SelectProduct> {
    const parsedInput = createProductInputSchema.parse(input);
    return runInTransaction(async (transaction) => {
      const product = await createProduct(parsedInput, transaction);
      await recordAudit(
        {
          actorId: actorProfileId,
          action: "created",
          entityType: "product",
          entityId: product.id,
          payload: createdFields(parsedInput),
        },
        transaction,
      );
      return product;
    });
  }

  public async getProductById(productId: string): Promise<SelectProduct | undefined> {
    return getProductById(productId);
  }

  public async updateProduct(
    productId: string,
    changes: UpdateProductInput,
    actorProfileId: string,
  ): Promise<SelectProduct | undefined> {
    const parsedChanges = updateProductInputSchema.parse(changes);
    const { before, after } = await this.updateProductWithAudit(
      productId,
      parsedChanges,
      actorProfileId,
    );
    if (before?.imageKey && after && before.imageKey !== after.imageKey) {
      await deleteObject(before.imageKey);
    }
    return after;
  }

  // A Product always has an image: updateProduct replaces it, nothing removes it.
  public deleteProductImage(): never {
    throw badRequest("A Product must have an image; upload a new one to replace it");
  }

  public async deactivateProduct(
    productId: string,
    actorProfileId: string,
  ): Promise<SelectProduct | undefined> {
    return this.changeProductState(productId, actorProfileId, "deactivated", (transaction) =>
      updateProduct(productId, { status: "inactive" }, transaction),
    );
  }

  public async reactivateProduct(
    productId: string,
    actorProfileId: string,
  ): Promise<SelectProduct | undefined> {
    return this.changeProductState(productId, actorProfileId, "activated", (transaction) =>
      reactivateProduct(productId, transaction),
    );
  }

  public async deleteProduct(
    productId: string,
    actorProfileId: string,
  ): Promise<SelectProduct | undefined> {
    return this.changeProductState(productId, actorProfileId, "deleted", async (transaction) => {
      const existingProduct = await getProductById(productId, transaction);
      if (!existingProduct) return undefined;
      await updateProduct(productId, { status: "inactive" }, transaction);
      return hardArchiveProduct(productId, transaction);
    });
  }

  private async updateProductWithAudit(
    productId: string,
    changes: Partial<SelectProduct>,
    actorProfileId: string,
  ): Promise<{ before?: SelectProduct; after?: SelectProduct }> {
    return runInTransaction(async (transaction) => {
      const before = await getProductById(productId, transaction);
      if (!before) return {};
      const after = await updateProduct(productId, changes, transaction);
      if (after) {
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "updated",
            entityType: "product",
            entityId: productId,
            payload: changedFields(before, after, productAuditedFields),
          },
          transaction,
        );
      }
      return { before, after };
    });
  }

  private async changeProductState(
    productId: string,
    actorProfileId: string,
    action: "activated" | "deactivated" | "deleted",
    write: (transaction: DbExecutor) => Promise<SelectProduct | undefined>,
  ): Promise<SelectProduct | undefined> {
    return runInTransaction(async (transaction) => {
      const product = await write(transaction);
      if (product) {
        await recordAudit(
          { actorId: actorProfileId, action, entityType: "product", entityId: productId },
          transaction,
        );
      }
      return product;
    });
  }

  public async listProducts(
    input: ListProductsInput,
  ): Promise<PaginatedResult<ProductWithVarieties>> {
    const parsedInput = listProductsInputSchema.parse(input);
    return listActiveProductsWithVarieties(
      { page: parsedInput.page, pageSize: parsedInput.pageSize },
      parsedInput.searchTerm,
    );
  }

  public async listProductsForAdmin(
    input: ListProductsInput,
  ): Promise<PaginatedResult<ProductWithVarieties>> {
    const parsedInput = listProductsInputSchema.parse(input);
    return listProductsForAdminWithVarieties(
      { page: parsedInput.page, pageSize: parsedInput.pageSize },
      parsedInput.searchTerm,
      parsedInput.includeDeleted,
    );
  }

  public async createProductVariety(
    input: CreateProductVarietyInput,
    actorProfileId: string,
  ): Promise<SelectProductVariety> {
    const parsedInput = createProductVarietyInputSchema.parse(input);
    const parentProduct = await getProductById(parsedInput.productId);
    if (!parentProduct) {
      throw notFound(`Cannot create variety, product ${parsedInput.productId} not found`);
    }
    await this.unitOfMeasureService.assertUnitExists(parsedInput.uomCode);
    const displayName = varietyDisplayName(parsedInput);
    const skuPrefix = varietySkuPrefix(varietySkuSlug(parentProduct.name, displayName));

    // Two creates can pick the same counter; the loser retries with the next one in a fresh
    // transaction.
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await runInTransaction(async (transaction) => {
          const existingSkus = await listVarietySkusWithPrefix(skuPrefix, transaction);
          const newVariety = { ...parsedInput, sku: nextVarietySku(skuPrefix, existingSkus) };
          const variety = await createProductVariety(newVariety, transaction);
          await recordAudit(
            {
              actorId: actorProfileId,
              action: "created",
              entityType: "product_variety",
              entityId: variety.id,
              payload: createdFields(newVariety),
            },
            transaction,
          );
          return variety;
        });
      } catch (error) {
        const constraint = violatedUniqueConstraint(error);
        if (constraint === varietyNameConstraint) {
          throw duplicateVarietyName(parentProduct.name, displayName);
        }
        if (constraint === varietySkuConstraint) {
          if (attempt < 5) continue;
          throw conflict("Could not generate a unique SKU for this variety, please try again");
        }
        throw error;
      }
    }
  }

  public async listVarietiesForProduct(
    productId: string,
    { includeInactive = false }: { includeInactive?: boolean } = {},
  ): Promise<SelectProductVariety[]> {
    return listVarietiesByProductId(productId, includeInactive);
  }

  // Name, size and unit only; the SKU never changes after insert.
  public async updateProductVariety(
    varietyId: string,
    changes: UpdateProductVarietyInput,
    actorProfileId: string,
  ): Promise<SelectProductVariety | undefined> {
    const parsedChanges = updateProductVarietyInputSchema.parse(changes);
    if (parsedChanges.uomCode)
      await this.unitOfMeasureService.assertUnitExists(parsedChanges.uomCode);
    try {
      return await runInTransaction(async (transaction) => {
        const before = await getProductVarietyById(varietyId, transaction);
        if (!before) return undefined;
        const after = await updateProductVariety(varietyId, parsedChanges, transaction);
        if (after) {
          await recordAudit(
            {
              actorId: actorProfileId,
              action: "updated",
              entityType: "product_variety",
              entityId: varietyId,
              payload: changedFields(before, after, ["name", "sizeValue", "uomCode"]),
            },
            transaction,
          );
        }
        return after;
      });
    } catch (error) {
      if (violatedUniqueConstraint(error) === varietyNameConstraint) {
        const variety = await getProductVarietyById(varietyId);
        const product = variety && (await getProductById(variety.productId));
        const taken = variety && varietyDisplayName({ ...variety, ...parsedChanges });
        throw duplicateVarietyName(product?.name ?? "this product", taken ?? "");
      }
      throw error;
    }
  }

  public async deactivateProductVariety(
    varietyId: string,
    actorProfileId: string,
  ): Promise<SelectProductVariety | undefined> {
    return runInTransaction(async (transaction) => {
      const variety = await softDeleteProductVariety(varietyId, transaction);
      if (variety) {
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "deactivated",
            entityType: "product_variety",
            entityId: varietyId,
          },
          transaction,
        );
      }
      return variety;
    });
  }

  public async reactivateProductVariety(
    varietyId: string,
    actorProfileId: string,
  ): Promise<SelectProductVariety | undefined> {
    return runInTransaction(async (transaction) => {
      const variety = await reactivateProductVariety(varietyId, transaction);
      if (variety) {
        await recordAudit(
          {
            actorId: actorProfileId,
            action: "activated",
            entityType: "product_variety",
            entityId: varietyId,
          },
          transaction,
        );
      }
      return variety;
    });
  }

  public async createImageUploadUrl(
    input: CreateImageUploadUrlInput,
  ): Promise<ImageUploadUrlResult> {
    const parsedInput = createImageUploadUrlInputSchema.parse(input);
    const imageKey = buildObjectKey(productImageFolderName, "admin", parsedInput.fileName);
    return createClientUpload(imageKey);
  }
}

export default ProductService;

export { varietySizeValueSchema } from "./model";
export { varietyDisplayName } from "./display-name";
