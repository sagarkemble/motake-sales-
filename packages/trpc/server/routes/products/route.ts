import { productService, varietyTaxPeriodService } from "../../services";
import { z } from "../../schema";
import { adminProcedure, protectedProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { notFound } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import {
  createImageUploadUrlInputSchema,
  createImageUploadUrlOutputSchema,
  createProductInputSchema,
  createProductVarietyInputSchema,
  currentTaxForVarietiesInputSchema,
  currentTaxSchema,
  deleteTaxPeriodOutputSchema,
  listProductsInputSchema,
  listTaxPeriodsInputSchema,
  paginatedProductsSchema,
  productIdInputSchema,
  productSchema,
  productVarietiesInputSchema,
  productVarietySchema,
  taxPeriodListSchema,
  updateProductInputSchema,
  updateProductVarietyInputSchema,
  upsertTaxPeriodInputSchema,
  upsertTaxPeriodOutputSchema,
  varietyIdInputSchema,
} from "./model";

const path = generatePath("/products");

export const productsRouter = router({
  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/"),
        tags: ["Products"],
        protect: true,
        summary: "List products",
        description: "Return a page of products in the catalog.",
      },
    })
    .input(listProductsInputSchema)
    .output(apiResponseSchema(paginatedProductsSchema))
    .query(async ({ input, ctx }) => {
      const result =
        ctx.user?.role === "admin"
          ? await productService.listProductsForAdmin(input)
          : await productService.listProducts(input);
      return apiResponse(result);
    }),

  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/{id}"),
        tags: ["Products"],
        protect: true,
        summary: "Get a product",
        description: "Return one product by id.",
      },
    })
    .input(productIdInputSchema)
    .output(apiResponseSchema(productSchema))
    .query(async ({ input }) => {
      const product = await productService.getProductById(input.id);
      if (!product) throw notFound(`Product ${input.id} not found`);
      return apiResponse(product);
    }),

  createImageUploadUrl: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/image-upload-url"),
        tags: ["Products"],
        protect: true,
        summary: "Get a product image upload URL",
        description:
          "Return a short-lived URL the browser can upload a product image to directly. Admin only.",
      },
    })
    .input(createImageUploadUrlInputSchema)
    .output(apiResponseSchema(createImageUploadUrlOutputSchema))
    .mutation(async ({ input }) => {
      const result = await productService.createImageUploadUrl(input);
      return apiResponse(result);
    }),

  deleteImage: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/{id}/image"),
        tags: ["Products"],
        protect: true,
        summary: "Delete a product image",
        description:
          "Always refused: a product must have an image. Upload a new one through update to replace it.",
      },
    })
    .input(productIdInputSchema)
    .output(apiResponseSchema(productSchema))
    .mutation(() => productService.deleteProductImage()),

  create: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/"),
        tags: ["Products"],
        protect: true,
        summary: "Add a product",
        description: "Create a new product in the catalog. Admin only.",
      },
    })
    .input(createProductInputSchema)
    .output(apiResponseSchema(productSchema))
    .mutation(async ({ ctx, input }) => {
      const product = await productService.createProduct(input, ctx.user.id);
      return apiResponse(product);
    }),

  update: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/{id}"),
        tags: ["Products"],
        protect: true,
        summary: "Update a product",
        description: "Change the details of an existing product. Admin only.",
      },
    })
    .input(productIdInputSchema.extend(updateProductInputSchema.shape))
    .output(apiResponseSchema(productSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const product = await productService.updateProduct(id, changes, ctx.user.id);
      if (!product) throw notFound(`Product ${id} not found`);
      return apiResponse(product);
    }),

  deactivate: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/{id}"),
        tags: ["Products"],
        protect: true,
        summary: "Deactivate a product",
        description: "Mark a product as inactive. The record stays for history and reports.",
      },
    })
    .input(productIdInputSchema)
    .output(apiResponseSchema(productSchema))
    .mutation(async ({ ctx, input }) => {
      const product = await productService.deactivateProduct(input.id, ctx.user.id);
      if (!product) throw notFound(`Product ${input.id} not found`);
      return apiResponse(product);
    }),

  reactivate: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/{id}/reactivate"),
        tags: ["Products"],
        protect: true,
        summary: "Reactivate a product",
        description: "Mark a product as active again.",
      },
    })
    .input(productIdInputSchema)
    .output(apiResponseSchema(productSchema))
    .mutation(async ({ ctx, input }) => {
      const product = await productService.reactivateProduct(input.id, ctx.user.id);
      if (!product) throw notFound(`Product ${input.id} not found`);
      return apiResponse(product);
    }),

  delete: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/{id}/delete"),
        tags: ["Products"],
        protect: true,
        summary: "Delete a product",
        description: "Soft-delete an existing product.",
      },
    })
    .input(productIdInputSchema)
    .output(apiResponseSchema(productSchema))
    .mutation(async ({ ctx, input }) => {
      const product = await productService.deleteProduct(input.id, ctx.user.id);
      if (!product) throw notFound(`Product ${input.id} not found`);
      return apiResponse(product);
    }),

  listVarieties: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/{productId}/varieties"),
        tags: ["Products"],
        protect: true,
        summary: "List varieties of a product",
        description: "Return every variety that belongs to the given product.",
      },
    })
    .input(productVarietiesInputSchema)
    .output(apiResponseSchema(z.array(productVarietySchema)))
    .query(async ({ ctx, input }) => {
      const varieties = await productService.listVarietiesForProduct(input.productId, {
        includeInactive: input.includeInactive && ctx.user?.role === "admin",
      });
      return apiResponse(varieties);
    }),

  createVariety: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/varieties"),
        tags: ["Products"],
        protect: true,
        summary: "Add a product variety",
        description:
          "Create a new variety under a product: a name (may be empty), a size and a unit from Settings > Units. The server generates its SKU. Admin only.",
      },
    })
    .input(createProductVarietyInputSchema)
    .output(apiResponseSchema(productVarietySchema))
    .mutation(async ({ ctx, input }) => {
      const variety = await productService.createProductVariety(input, ctx.user.id);
      return apiResponse(variety);
    }),

  updateVariety: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/varieties/{id}"),
        tags: ["Products"],
        protect: true,
        summary: "Update a product variety",
        description:
          "Change a product variety's name, size or unit; size and unit change together. The SKU never changes. Admin only.",
      },
    })
    .input(varietyIdInputSchema.extend(updateProductVarietyInputSchema.shape))
    .output(apiResponseSchema(productVarietySchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const variety = await productService.updateProductVariety(id, changes, ctx.user.id);
      if (!variety) throw notFound(`Product variety ${id} not found`);
      return apiResponse(variety);
    }),

  deactivateVariety: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/varieties/{id}"),
        tags: ["Products"],
        protect: true,
        summary: "Deactivate a product variety",
        description:
          "Mark a product variety as inactive. The record stays for history and reports.",
      },
    })
    .input(varietyIdInputSchema)
    .output(apiResponseSchema(productVarietySchema))
    .mutation(async ({ ctx, input }) => {
      const variety = await productService.deactivateProductVariety(input.id, ctx.user.id);
      if (!variety) throw notFound(`Product variety ${input.id} not found`);
      return apiResponse(variety);
    }),

  reactivateVariety: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/varieties/{id}/reactivate"),
        tags: ["Products"],
        protect: true,
        summary: "Reactivate a product variety",
        description: "Mark a deactivated product variety as active again.",
      },
    })
    .input(varietyIdInputSchema)
    .output(apiResponseSchema(productVarietySchema))
    .mutation(async ({ ctx, input }) => {
      const variety = await productService.reactivateProductVariety(input.id, ctx.user.id);
      if (!variety) throw notFound(`Product variety ${input.id} not found`);
      return apiResponse(variety);
    }),

  listTaxPeriods: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/varieties/{varietyId}/tax-periods"),
        tags: ["Products"],
        protect: true,
        summary: "List a variety's tax periods",
        description:
          "Return every GST period of a variety, newest start first, with the current financial year. Admin only.",
      },
    })
    .input(listTaxPeriodsInputSchema)
    .output(apiResponseSchema(taxPeriodListSchema))
    .query(async ({ input }) => {
      const list = await varietyTaxPeriodService.listForVariety(input.varietyId);
      return apiResponse(list);
    }),

  currentTaxForVarieties: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/varieties/current-tax"),
        tags: ["Products"],
        protect: true,
        summary: "Today's tax for varieties",
        description:
          "Return the GST period covering today for each variety, or null when it cannot be sold today. Admin only.",
      },
    })
    .input(currentTaxForVarietiesInputSchema)
    .output(apiResponseSchema(z.array(currentTaxSchema)))
    .query(async ({ input }) => {
      const current = await varietyTaxPeriodService.getCurrentForVarieties(input.varietyIds);
      return apiResponse(current);
    }),

  upsertTaxPeriod: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/varieties/{varietyId}/tax-periods"),
        tags: ["Products"],
        protect: true,
        summary: "Add or edit a tax period",
        description:
          "Add a GST period, or overwrite HSN, exempt and rate of the period with the same start. Only starts in the current financial year. Admin only.",
      },
    })
    .input(upsertTaxPeriodInputSchema)
    .output(apiResponseSchema(upsertTaxPeriodOutputSchema))
    .mutation(async ({ ctx, input }) => {
      const result = await varietyTaxPeriodService.upsert(input, ctx.user.id);
      return apiResponse(result);
    }),

  deleteTaxPeriod: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/tax-periods/{id}"),
        tags: ["Products"],
        protect: true,
        summary: "Delete a tax period",
        description:
          "Delete a GST period that starts in the current financial year and return what covers today afterwards. Admin only.",
      },
    })
    .input(varietyIdInputSchema)
    .output(apiResponseSchema(deleteTaxPeriodOutputSchema))
    .mutation(async ({ ctx, input }) => {
      const result = await varietyTaxPeriodService.delete(input.id, ctx.user.id);
      return apiResponse(result);
    }),
});
