import { and, asc, count, eq, ilike, inArray, isNull } from "drizzle-orm";

import { db } from "../../index";
import {
  productVarietiesTable,
  productsTable,
  type InsertProduct,
  type InsertProductVariety,
  type SelectProduct,
  type SelectProductVariety,
} from "../../schema";
import { firstOrThrow } from "../shared/assertions";
import {
  buildPaginationOffsets,
  toPaginatedResult,
  type PaginatedResult,
  type PaginationParams,
} from "../shared/pagination";

export interface ProductWithVarieties {
  product: SelectProduct;
  varieties: SelectProductVariety[];
}

export async function createProduct(newProduct: InsertProduct): Promise<SelectProduct> {
  const insertedRows = await db.insert(productsTable).values(newProduct).returning();
  return firstOrThrow(insertedRows, "createProduct");
}

export async function getProductById(productId: string): Promise<SelectProduct | undefined> {
  const [product] = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.id, productId), isNull(productsTable.deletedAt)));
  return product;
}

export async function updateProduct(
  productId: string,
  changes: Partial<InsertProduct>,
): Promise<SelectProduct | undefined> {
  const [updatedProduct] = await db
    .update(productsTable)
    .set(changes)
    .where(eq(productsTable.id, productId))
    .returning();
  return updatedProduct;
}

export async function softDeleteProduct(productId: string): Promise<SelectProduct | undefined> {
  const [deletedProduct] = await db
    .update(productsTable)
    .set({ deletedAt: new Date(), status: "inactive" })
    .where(eq(productsTable.id, productId))
    .returning();
  return deletedProduct;
}

export async function searchActiveProducts(
  searchTerm: string | undefined,
  pagination: PaginationParams,
): Promise<PaginatedResult<SelectProduct>> {
  const { limit, offset } = buildPaginationOffsets(pagination);
  const whereClause = and(
    eq(productsTable.status, "active"),
    isNull(productsTable.deletedAt),
    searchTerm ? ilike(productsTable.name, `%${searchTerm}%`) : undefined,
  );

  const [items, countRows] = await Promise.all([
    db
      .select()
      .from(productsTable)
      .where(whereClause)
      .orderBy(asc(productsTable.name))
      .limit(limit)
      .offset(offset),
    db.select({ totalCount: count() }).from(productsTable).where(whereClause),
  ]);

  const { totalCount } = firstOrThrow(countRows, "searchActiveProducts count");
  return toPaginatedResult(items, totalCount, pagination);
}

export async function listActiveProductsWithVarieties(
  pagination: PaginationParams,
  searchTerm?: string,
): Promise<PaginatedResult<ProductWithVarieties>> {
  const productsPage = await searchActiveProducts(searchTerm, pagination);
  if (productsPage.items.length === 0) {
    return { ...productsPage, items: [] };
  }

  const productIds = productsPage.items.map((product) => product.id);
  const varieties = await db
    .select()
    .from(productVarietiesTable)
    .where(
      and(
        inArray(productVarietiesTable.productId, productIds),
        eq(productVarietiesTable.status, "active"),
        isNull(productVarietiesTable.deletedAt),
      ),
    );

  const varietiesByProductId = new Map<string, SelectProductVariety[]>();
  for (const variety of varieties) {
    const existingVarieties = varietiesByProductId.get(variety.productId) ?? [];
    existingVarieties.push(variety);
    varietiesByProductId.set(variety.productId, existingVarieties);
  }

  return {
    ...productsPage,
    items: productsPage.items.map((product) => ({
      product,
      varieties: varietiesByProductId.get(product.id) ?? [],
    })),
  };
}

export async function createProductVariety(
  newVariety: InsertProductVariety,
): Promise<SelectProductVariety> {
  const insertedRows = await db.insert(productVarietiesTable).values(newVariety).returning();
  return firstOrThrow(insertedRows, "createProductVariety");
}

export async function getProductVarietyById(
  varietyId: string,
): Promise<SelectProductVariety | undefined> {
  const [variety] = await db
    .select()
    .from(productVarietiesTable)
    .where(and(eq(productVarietiesTable.id, varietyId), isNull(productVarietiesTable.deletedAt)));
  return variety;
}

export async function getProductVarietyBySku(
  sku: string,
): Promise<SelectProductVariety | undefined> {
  const [variety] = await db
    .select()
    .from(productVarietiesTable)
    .where(eq(productVarietiesTable.sku, sku));
  return variety;
}

export async function listVarietiesByProductId(
  productId: string,
): Promise<SelectProductVariety[]> {
  return db
    .select()
    .from(productVarietiesTable)
    .where(
      and(eq(productVarietiesTable.productId, productId), isNull(productVarietiesTable.deletedAt)),
    )
    .orderBy(asc(productVarietiesTable.name));
}

export async function listActiveVarietiesByIds(
  varietyIds: string[],
): Promise<SelectProductVariety[]> {
  if (varietyIds.length === 0) return [];
  return db
    .select()
    .from(productVarietiesTable)
    .where(
      and(
        inArray(productVarietiesTable.id, varietyIds),
        eq(productVarietiesTable.status, "active"),
        isNull(productVarietiesTable.deletedAt),
      ),
    );
}

export async function updateProductVariety(
  varietyId: string,
  changes: Partial<InsertProductVariety>,
): Promise<SelectProductVariety | undefined> {
  const [updatedVariety] = await db
    .update(productVarietiesTable)
    .set(changes)
    .where(eq(productVarietiesTable.id, varietyId))
    .returning();
  return updatedVariety;
}

export async function softDeleteProductVariety(
  varietyId: string,
): Promise<SelectProductVariety | undefined> {
  const [deletedVariety] = await db
    .update(productVarietiesTable)
    .set({ deletedAt: new Date(), status: "inactive" })
    .where(eq(productVarietiesTable.id, varietyId))
    .returning();
  return deletedVariety;
}
