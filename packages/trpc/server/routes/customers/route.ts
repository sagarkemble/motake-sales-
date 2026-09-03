import { customerService } from "../../services";
import { adminProcedure, protectedProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { notFound } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import { z } from "../../schema";
import {
  createCustomerInputSchema,
  createShopPhotoUploadUrlInputSchema,
  createShopPhotoUploadUrlOutputSchema,
  customerIdInputSchema,
  customerSchema,
  customerStatsSchema,
  listCustomersInputSchema,
  openOrderSummarySchema,
  paginatedCustomersSchema,
  updateCustomerInputSchema,
} from "./model";

const path = generatePath("/customers");

export const customersRouter = router({
  list: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/"),
        tags: ["Customers"],
        protect: true,
        summary: "List customers",
        description: "Return a page of customers. Search by name or phone number.",
      },
    })
    .input(listCustomersInputSchema)
    .output(apiResponseSchema(paginatedCustomersSchema))
    .query(async ({ ctx, input }) => {
      const includeInactive = ctx.user.role === "admin" && Boolean(input.includeInactive);
      const result = await customerService.searchCustomers({
        ...input,
        includeInactive,
      });
      return apiResponse(result);
    }),

  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/{id}"),
        tags: ["Customers"],
        protect: true,
        summary: "Get a customer",
        description: "Return one customer by id.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(customerSchema))
    .query(async ({ ctx, input }) => {
      const customer = await customerService.getCustomerById(input.id);
      if (!customer) throw notFound(`Customer ${input.id} not found`);
      if (ctx.user.role !== "admin" && customer.deletedAt) {
        throw notFound(`Customer ${input.id} not found`);
      }
      return apiResponse(customer);
    }),

  getStats: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/{id}/stats"),
        tags: ["Customers"],
        protect: true,
        summary: "Get customer stats",
        description:
          "Return lifetime order count, quantity sold, and last order date for a customer.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(customerStatsSchema))
    .query(async ({ input }) => {
      const stats = await customerService.getCustomerStats(input.id);
      return apiResponse(stats);
    }),

  listOpenOrders: adminProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/{id}/open-orders"),
        tags: ["Customers"],
        protect: true,
        summary: "List open orders for a customer",
        description:
          "Return orders that must be closed or cancelled before the customer can be deactivated.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(z.array(openOrderSummarySchema)))
    .query(async ({ input }) => {
      const openOrders = await customerService.listOpenOrders(input.id);
      return apiResponse(openOrders);
    }),

  createShopPhotoUploadUrl: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/shop-photo-upload-url"),
        tags: ["Customers"],
        protect: true,
        summary: "Get a shop photo upload URL",
        description:
          "Return a short-lived URL the browser can upload a customer shop photo to directly. Admin or salesman.",
      },
    })
    .input(createShopPhotoUploadUrlInputSchema)
    .output(apiResponseSchema(createShopPhotoUploadUrlOutputSchema))
    .mutation(async ({ ctx, input }) => {
      const result = await customerService.createShopPhotoUploadUrl(ctx.user.id, input);
      return apiResponse(result);
    }),

  create: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/"),
        tags: ["Customers"],
        protect: true,
        summary: "Add a customer",
        description:
          "Create a customer record with a required shop photo. Admin or salesman can add to the shared list.",
      },
    })
    .input(createCustomerInputSchema)
    .output(apiResponseSchema(customerSchema))
    .mutation(async ({ ctx, input }) => {
      const customer = await customerService.createCustomer({ ...input, createdBy: ctx.user.id });
      return apiResponse(customer);
    }),

  update: adminProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: path("/{id}"),
        tags: ["Customers"],
        protect: true,
        summary: "Update a customer",
        description: "Change the details of an existing customer, including shop photo. Admin only.",
      },
    })
    .input(customerIdInputSchema.extend(updateCustomerInputSchema.shape))
    .output(apiResponseSchema(customerSchema))
    .mutation(async ({ input }) => {
      const { id, ...changes } = input;
      const customer = await customerService.updateCustomer(id, changes);
      if (!customer) throw notFound(`Customer ${id} not found`);
      return apiResponse(customer);
    }),

  deleteShopPhoto: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/{id}/shop-photo"),
        tags: ["Customers"],
        protect: true,
        summary: "Delete a customer shop photo",
        description: "Remove the shop photo from a customer. Admin only.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(customerSchema))
    .mutation(async ({ input }) => {
      const customer = await customerService.deleteCustomerShopPhoto(input.id);
      if (!customer) throw notFound(`Customer ${input.id} not found`);
      return apiResponse(customer);
    }),

  deactivate: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/{id}"),
        tags: ["Customers"],
        protect: true,
        summary: "Deactivate a customer",
        description:
          "Mark a customer as inactive after all open orders are closed or cancelled. The record stays for history and reports.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(customerSchema))
    .mutation(async ({ input }) => {
      const customer = await customerService.deactivateCustomer(input.id);
      if (!customer) throw notFound(`Customer ${input.id} not found`);
      return apiResponse(customer);
    }),

  reactivate: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/{id}/reactivate"),
        tags: ["Customers"],
        protect: true,
        summary: "Reactivate a customer",
        description: "Restore an inactive customer to the active list. Admin only.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(customerSchema))
    .mutation(async ({ input }) => {
      const customer = await customerService.reactivateCustomer(input.id);
      return apiResponse(customer);
    }),
});
