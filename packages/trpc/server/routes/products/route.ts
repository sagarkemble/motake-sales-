import { productService } from "../../services";
import { z } from "../../schema";
import { adminProcedure, protectedProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { notFound } from "../../utils/error";
import { generatePath } from "../../utils/path-generator";
import {
  createProductInputSchema,
  createProductVarietyInputSchema,
  listProductsInputSchema,
  paginatedProductsSchema,
  productIdInputSchema,
  productSchema,
  productVarietiesInputSchema,
  productVarietySchema,
  updateProductInputSchema,
  updateProductVarietyInputSchema,
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
    .query(async ({ input }) => {
      const result = await productService.listProducts(input);
      return apiResponse(result);
    }),

  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/:id"),
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
    .mutation(async ({ input }) => {
      const product = await productService.createProduct(input);
      return apiResponse(product);
    }),

  update: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/:id"),
        tags: ["Products"],
        protect: true,
        summary: "Update a product",
        description: "Change the details of an existing product. Admin only.",
      },
    })
    .input(productIdInputSchema.extend(updateProductInputSchema.shape))
    .output(apiResponseSchema(productSchema))
    .mutation(async ({ input }) => {
      const { id, ...changes } = input;
      const product = await productService.updateProduct(id, changes);
      if (!product) throw notFound(`Product ${id} not found`);
      return apiResponse(product);
    }),

  deactivate: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/:id"),
        tags: ["Products"],
        protect: true,
        summary: "Deactivate a product",
        description: "Mark a product as inactive. The record stays for history and reports.",
      },
    })
    .input(productIdInputSchema)
    .output(apiResponseSchema(productSchema))
    .mutation(async ({ input }) => {
      const product = await productService.deactivateProduct(input.id);
      if (!product) throw notFound(`Product ${input.id} not found`);
      return apiResponse(product);
    }),

  listVarieties: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/:productId/varieties"),
        tags: ["Products"],
        protect: true,
        summary: "List varieties of a product",
        description: "Return every variety that belongs to the given product.",
      },
    })
    .input(productVarietiesInputSchema)
    .output(apiResponseSchema(z.array(productVarietySchema)))
    .query(async ({ input }) => {
      const varieties = await productService.listVarietiesForProduct(input.productId);
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
        description: "Create a new variety under a product. Admin only.",
      },
    })
    .input(createProductVarietyInputSchema)
    .output(apiResponseSchema(productVarietySchema))
    .mutation(async ({ input }) => {
      const variety = await productService.createProductVariety(input);
      return apiResponse(variety);
    }),

  updateVariety: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/varieties/:id"),
        tags: ["Products"],
        protect: true,
        summary: "Update a product variety",
        description: "Change the details of an existing product variety. Admin only.",
      },
    })
    .input(varietyIdInputSchema.extend(updateProductVarietyInputSchema.shape))
    .output(apiResponseSchema(productVarietySchema))
    .mutation(async ({ input }) => {
      const { id, ...changes } = input;
      const variety = await productService.updateProductVariety(id, changes);
      if (!variety) throw notFound(`Product variety ${id} not found`);
      return apiResponse(variety);
    }),

  deactivateVariety: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/varieties/:id"),
        tags: ["Products"],
        protect: true,
        summary: "Deactivate a product variety",
        description: "Mark a product variety as inactive. The record stays for history and reports.",
      },
    })
    .input(varietyIdInputSchema)
    .output(apiResponseSchema(productVarietySchema))
    .mutation(async ({ input }) => {
      const variety = await productService.deactivateProductVariety(input.id);
      if (!variety) throw notFound(`Product variety ${input.id} not found`);
      return apiResponse(variety);
    }),
});
