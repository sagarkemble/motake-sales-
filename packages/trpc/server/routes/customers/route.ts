import { customerService } from "../../services";
import { adminProcedure, protectedProcedure, router } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { badRequest, notFound } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import { z } from "../../schema";
import {
  createCustomerInputSchema,
  createShopPhotoUploadUrlInputSchema,
  createShopPhotoUploadUrlOutputSchema,
  customerIdInputSchema,
  customerSchema,
  customerStatsSchema,
  customerWithRouteSchema,
  listCustomersInputSchema,
  moveCustomerRouteInputSchema,
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
        description:
          "Return a page of customers with their Route. Admin sees every Route and may filter by one; both search by name, contact, phone or address. A salesman sees only active Customers on their Active GatePass Route and is refused with no Active GatePass.",
      },
    })
    .input(listCustomersInputSchema)
    .output(apiResponseSchema(paginatedCustomersSchema))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        const result = await customerService.searchCustomersForSalesman(
          { searchTerm: input.searchTerm, page: input.page, pageSize: input.pageSize },
          ctx.user.id,
        );
        return apiResponse(result);
      }
      const result = await customerService.searchCustomers(input);
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
        description:
          "Return one customer by id with its Route. A salesman gets not found for a Customer off their Active GatePass Route.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(customerWithRouteSchema))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        return apiResponse(await customerService.getCustomerForSalesman(input.id, ctx.user.id));
      }
      const customer = await customerService.getCustomerById(input.id);
      if (!customer) throw notFound(`Customer ${input.id} not found`);
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
          "Return order count, billed quantity, lifetime Bill value in paise, and last order date for a customer.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(customerStatsSchema))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        await customerService.getCustomerForSalesman(input.id, ctx.user.id);
      }
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
          "Create a customer with a required shop photo and a Preferred language (Marathi by default, fixed afterwards). Admin picks the Route and may set GSTIN and E-invoicing required; a salesman's Customer goes on their Active GatePass Route.",
      },
    })
    .input(createCustomerInputSchema)
    .output(apiResponseSchema(customerSchema))
    .mutation(async ({ ctx, input }) => {
      const { routeId, gstin, einvoicingRequired, ...details } = input;
      if (ctx.user.role !== "admin") {
        const customer = await customerService.createCustomerAsSalesman(details, ctx.user.id);
        return apiResponse(customer);
      }
      if (!routeId) throw badRequest("Pick a Route for the Customer");
      const customer = await customerService.createCustomerAsAdmin(
        { ...details, routeId, gstin, einvoicingRequired },
        ctx.user.id,
      );
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
        description:
          "Change the details of an existing customer, including shop photo, GSTIN and E-invoicing required. The Route (see Move to Route) and Preferred language are not changed here. Admin only.",
      },
    })
    .input(customerIdInputSchema.extend(updateCustomerInputSchema.shape))
    .output(apiResponseSchema(customerSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;
      const customer = await customerService.updateCustomer(id, changes, ctx.user.id);
      if (!customer) throw notFound(`Customer ${id} not found`);
      return apiResponse(customer);
    }),

  moveRoute: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/{id}/move-route"),
        tags: ["Customers"],
        protect: true,
        summary: "Move a customer to another Route",
        description:
          "Move the customer to another listed Route. Refused while the customer has an open Pre-order. Balance, Ledger and Bills stay with the customer. Admin only.",
      },
    })
    .input(moveCustomerRouteInputSchema)
    .output(apiResponseSchema(customerSchema))
    .mutation(async ({ ctx, input }) => {
      const customer = await customerService.moveCustomerToRoute(
        input.id,
        input.toRouteId,
        ctx.user.id,
      );
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
    .mutation(async ({ ctx, input }) => {
      const customer = await customerService.deleteCustomerShopPhoto(input.id, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      const customer = await customerService.deactivateCustomer(input.id, ctx.user.id);
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
    .mutation(async ({ ctx, input }) => {
      const customer = await customerService.reactivateCustomer(input.id, ctx.user.id);
      return apiResponse(customer);
    }),
});
