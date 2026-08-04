import { customerService } from "../../services";
import { adminProcedure, protectedProcedure, router, salesmanProcedure } from "../../trpc";
import { apiResponse, apiResponseSchema } from "../../utils/api-response";
import { notFound } from "@repo/services/errors";
import { generatePath } from "../../utils/path-generator";
import {
  createCustomerInputSchema,
  customerIdInputSchema,
  customerSchema,
  customerStatsSchema,
  listCustomersInputSchema,
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
    .query(async ({ input }) => {
      const result = await customerService.searchCustomers(input);
      return apiResponse(result);
    }),

  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/:id"),
        tags: ["Customers"],
        protect: true,
        summary: "Get a customer",
        description: "Return one customer by id.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(customerSchema))
    .query(async ({ input }) => {
      const customer = await customerService.getCustomerById(input.id);
      if (!customer) throw notFound(`Customer ${input.id} not found`);
      return apiResponse(customer);
    }),

  getStats: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: path("/:id/stats"),
        tags: ["Customers"],
        protect: true,
        summary: "Get customer stats",
        description: "Return lifetime order count, quantity sold, and last order date for a customer.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(customerStatsSchema))
    .query(async ({ input }) => {
      const stats = await customerService.getCustomerStats(input.id);
      return apiResponse(stats);
    }),

  create: salesmanProcedure
    .meta({
      openapi: {
        method: "POST",
        path: path("/"),
        tags: ["Customers"],
        protect: true,
        summary: "Add a customer",
        description: "Create a customer record. Any salesman can add a customer to the shared list.",
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
        path: path("/:id"),
        tags: ["Customers"],
        protect: true,
        summary: "Update a customer",
        description: "Change the details of an existing customer. Admin only.",
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

  deactivate: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: path("/:id"),
        tags: ["Customers"],
        protect: true,
        summary: "Deactivate a customer",
        description: "Mark a customer as inactive. The record stays for history and reports.",
      },
    })
    .input(customerIdInputSchema)
    .output(apiResponseSchema(customerSchema))
    .mutation(async ({ input }) => {
      const customer = await customerService.deactivateCustomer(input.id);
      if (!customer) throw notFound(`Customer ${input.id} not found`);
      return apiResponse(customer);
    }),
});
