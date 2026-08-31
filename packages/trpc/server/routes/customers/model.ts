import { z } from "../../schema";

export const customerSchema = z.object({
  id: z.string(),
  shopName: z.string(),
  contactName: z.string().nullable(),
  phone: z.string(),
  address: z.string(),
  notes: z.string().nullable(),
  createdBy: z.string(),
  status: z.enum(["active", "inactive"]),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
});

export const paginatedCustomersSchema = z.object({
  items: z.array(customerSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export const createCustomerInputSchema = z.object({
  shopName: z.string().min(1).max(200),
  contactName: z.string().max(120).optional(),
  phone: z.string().min(1).max(20),
  address: z.string().min(1),
  notes: z.string().optional(),
});

export const updateCustomerInputSchema = z.object({
  shopName: z.string().min(1).max(200).optional(),
  contactName: z.string().max(120).optional(),
  phone: z.string().min(1).max(20).optional(),
  address: z.string().min(1).optional(),
  notes: z.string().optional(),
});

export const customerIdInputSchema = z.object({ id: z.string().uuid() });

export const customerStatsSchema = z.object({
  totalOrderCount: z.number(),
  totalQuantitySold: z.number(),
  lifetimeValue: z.number(),
  lastOrderAt: z.date().nullable(),
});

export const listCustomersInputSchema = z.object({
  searchTerm: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
